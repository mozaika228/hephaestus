import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const apiBase = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000');

void main() => runApp(const HephaestusApp());

class HephaestusApp extends StatelessWidget {
  const HephaestusApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Hephaestus',
    theme: ThemeData(brightness: Brightness.dark, colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF27F5B8)), useMaterial3: true),
    home: const ConsoleScreen(),
  );
}

class ConsoleScreen extends StatefulWidget {
  const ConsoleScreen({super.key});
  @override
  State<ConsoleScreen> createState() => _ConsoleScreenState();
}

class _ConsoleScreenState extends State<ConsoleScreen> {
  static final _secureStorage = FlutterSecureStorage();
  final _controller = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final List<Message> _messages = [];
  List<dynamic> _conversations = [];
  String? _conversationId;
  String _provider = 'openai';
  bool _pending = false;
  String? _fileName;
  String? _fileId;
  String? _providerFileId;
  String? _analysis;
  String? _token;
  bool _authReady = false;
  bool _registerMode = false;
  String? _authError;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Map<String, String> _headers({bool json = false}) => {
    if (json) 'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<void> _restoreSession() async {
    final saved = await _secureStorage.read(key: 'hephaestus_token');
    if (saved != null) {
      try {
        final response = await http.get(Uri.parse('$apiBase/auth/me'), headers: {'Authorization': 'Bearer $saved'}).timeout(const Duration(seconds: 20));
        if (response.statusCode == 200) _token = saved;
        else await _secureStorage.delete(key: 'hephaestus_token');
      } catch (_) { _authError = 'Cannot connect to the Hephaestus API.'; }
    }
    if (mounted) setState(() => _authReady = true);
    if (_token != null) _refreshConversations();
  }

  Future<void> _authenticate() async {
    setState(() { _authError = null; _pending = true; });
    try {
      final response = await http.post(Uri.parse('$apiBase/auth/${_registerMode ? 'register' : 'login'}'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'email': _emailController.text.trim(), 'password': _passwordController.text})).timeout(const Duration(seconds: 30));
      final data = jsonDecode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) throw Exception(data['error']?['message'] ?? 'Sign-in failed');
      final token = data['token'] as String?;
      if (token == null || token.isEmpty) throw Exception('Authentication response did not include a session token');
      _token = token;
      await _secureStorage.write(key: 'hephaestus_token', value: token);
      _passwordController.clear();
      if (mounted) setState(() {});
      await _refreshConversations();
    } catch (error) {
      if (mounted) setState(() => _authError = error.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => _pending = false); }
  }

  Future<void> _signOut() async {
    if (_token != null) {
      await http.post(Uri.parse('$apiBase/auth/logout'), headers: _headers()).timeout(const Duration(seconds: 10)).catchError((_) => http.Response('', 500));
    }
    await _secureStorage.delete(key: 'hephaestus_token');
    if (mounted) setState(() { _token = null; _messages.clear(); _conversations = []; _conversationId = null; });
  }

  Future<void> _refreshConversations() async {
    try {
      final response = await http.get(Uri.parse('$apiBase/conversations'), headers: _headers()).timeout(const Duration(seconds: 20));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && mounted) setState(() => _conversations = data['conversations'] ?? []);
    } catch (_) { /* Keep the chat usable while the API is unavailable. */ }
  }

  Future<void> _openConversation(String id) async {
    final response = await http.get(Uri.parse('$apiBase/conversations/$id'), headers: _headers()).timeout(const Duration(seconds: 20));
    final data = jsonDecode(response.body);
    if (response.statusCode != 200 || !mounted) return;
    setState(() {
      _conversationId = id;
      _provider = data['conversation']['provider'] ?? 'openai';
      _messages
        ..clear()
        ..addAll((data['messages'] as List).where((m) => m['role'] != 'system').map((m) => Message(role: m['role'], text: m['content'] ?? '')));
      final files = data['files'] as List? ?? [];
      final latest = files.isNotEmpty ? files.last : null;
      _fileName = latest?['name'];
      _fileId = latest?['id'];
      _providerFileId = null;
      _analysis = null;
    });
  }

  void _newConversation() {
    if (_pending) return;
    setState(() {
      _conversationId = null;
      _messages.clear();
      _fileName = null;
      _fileId = null;
      _providerFileId = null;
      _analysis = null;
    });
  }

  Future<String?> _ensureConversation() async {
    if (_conversationId != null) return _conversationId;
    final response = await http.post(Uri.parse('$apiBase/conversations'), headers: _headers(json: true), body: jsonEncode({'provider': _provider})).timeout(const Duration(seconds: 20));
    final data = jsonDecode(response.body);
    if (response.statusCode != 201) throw Exception(data['error']?['message'] ?? 'Could not create conversation');
    final id = data['conversation']['id'] as String;
    if (mounted) setState(() => _conversationId = id);
    await _refreshConversations();
    return id;
  }

  Future<void> _sendMessage() async {
    if (_controller.text.trim().isEmpty || _pending) return;
    final text = _controller.text.trim();
    setState(() { _messages.add(Message(role: 'user', text: text)); _pending = true; _controller.clear(); });
    try {
      final response = await http.post(Uri.parse('$apiBase/chat/single'), headers: _headers(json: true), body: jsonEncode({
        'message': text, 'provider': _provider, 'conversationId': _conversationId, 'fileId': _providerFileId, 'attachmentId': _fileId,
      })).timeout(const Duration(minutes: 2));
      final payload = jsonDecode(response.body);
      if (response.statusCode == 200) {
        setState(() {
          _conversationId = payload['conversationId'];
          _messages.add(Message(role: 'assistant', text: payload['text'] ?? ''));
        });
        await _refreshConversations();
      } else {
        setState(() => _messages.add(Message(role: 'assistant', text: payload['error']?['message'] ?? 'The request failed.')));
      }
    } catch (error) {
      if (mounted) setState(() => _messages.add(Message(role: 'assistant', text: 'Connection error: $error')));
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(withData: true);
    if (result == null || result.files.isEmpty || result.files.first.bytes == null) return;
    try {
      final conversationId = await _ensureConversation();
      final request = http.MultipartRequest('POST', Uri.parse('$apiBase/files/ingest'))
        ..fields['conversationId'] = conversationId!
        ..files.add(http.MultipartFile.fromBytes('file', result.files.first.bytes!, filename: result.files.first.name));
      request.headers.addAll(_headers());
      final response = await request.send().timeout(const Duration(minutes: 2));
      final payload = jsonDecode(await response.stream.bytesToString());
      if (response.statusCode != 200) throw Exception(payload['error']?['message'] ?? 'Upload failed');
      if (mounted) setState(() {
        _fileName = payload['file']?['name'];
        _fileId = payload['file']?['id'];
        _providerFileId = payload['file']?['providerFileId'];
        _analysis = null;
      });
    } catch (error) {
      if (mounted) setState(() => _messages.add(Message(role: 'assistant', text: 'Upload error: $error')));
    }
  }

  Future<void> _analyzeFile() async {
    if (_fileId == null) return;
    try {
      final response = await http.post(Uri.parse('$apiBase/files/$_fileId/analyze'), headers: _headers()).timeout(const Duration(minutes: 2));
      final payload = jsonDecode(response.body);
      if (response.statusCode == 200 && mounted) setState(() => _analysis = payload['analysis']?['text'] ?? payload['analysis']?['error'] ?? '');
    } catch (error) {
      if (mounted) setState(() => _analysis = 'Analysis error: $error');
    }
  }

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    if (!_authReady) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_token == null) return _buildAuthScreen();
    return Scaffold(
    body: Container(
      decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF020403), Color(0xFF020807)], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
                const Expanded(child: Text('Hephaestus', style: TextStyle(fontSize: 26, color: Color(0xFF27F5B8), fontWeight: FontWeight.bold))),
          IconButton(onPressed: _newConversation, icon: const Icon(Icons.add_comment_outlined), tooltip: 'New chat'),
                IconButton(onPressed: _signOut, icon: const Icon(Icons.logout), tooltip: 'Sign out'),
          DropdownButton<String>(value: _provider, items: const [DropdownMenuItem(value: 'openai', child: Text('OpenAI')), DropdownMenuItem(value: 'ollama', child: Text('Ollama'))], onChanged: (value) { if (value != null) setState(() => _provider = value); }),
        ]),
        SizedBox(height: 48, child: ListView(scrollDirection: Axis.horizontal, children: _conversations.map((item) => Padding(padding: const EdgeInsets.only(right: 8), child: ActionChip(label: Text(item['title'] ?? 'Chat'), onPressed: () => _openConversation(item['id'])))).toList())),
        Expanded(child: ListView.builder(itemCount: _messages.length, itemBuilder: (context, index) {
          final message = _messages[index];
          return Align(alignment: message.role == 'user' ? Alignment.centerRight : Alignment.centerLeft, child: Container(margin: const EdgeInsets.symmetric(vertical: 6), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: message.role == 'user' ? const Color(0x3327F5B8) : const Color(0xFF061412), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x3327F5B8))), child: Text(message.text)));
        })),
        Row(children: [Expanded(child: TextField(controller: _controller, decoration: const InputDecoration(hintText: 'Type a message...'), onSubmitted: (_) => _sendMessage())), const SizedBox(width: 8), ElevatedButton(onPressed: _pending ? null : _sendMessage, child: Text(_pending ? '...' : 'Send'))]),
        const SizedBox(height: 8),
        Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [OutlinedButton(onPressed: _pickFile, child: const Text('Attach file')), OutlinedButton(onPressed: _analyzeFile, child: const Text('Analyze')), if (_fileName != null) Text(_fileName!)]),
        if (_analysis != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_analysis!)),
      ]))),
    ),
    );
  }

  Widget _buildAuthScreen() => Scaffold(
    body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('Hephaestus', style: TextStyle(fontSize: 30, color: Color(0xFF27F5B8), fontWeight: FontWeight.bold)),
      const SizedBox(height: 24),
      TextField(controller: _emailController, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email')),
      TextField(controller: _passwordController, obscureText: true, autofillHints: [_registerMode ? AutofillHints.newPassword : AutofillHints.password], decoration: const InputDecoration(labelText: 'Password')),
      if (_registerMode) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Use at least 12 characters.')),
      if (_authError != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_authError!, style: const TextStyle(color: Colors.redAccent))),
      const SizedBox(height: 16),
      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _pending ? null : _authenticate, child: Text(_pending ? 'Please wait…' : _registerMode ? 'Create account' : 'Sign in'))),
      TextButton(onPressed: () => setState(() { _registerMode = !_registerMode; _authError = null; }), child: Text(_registerMode ? 'Already have an account? Sign in' : 'New to Hephaestus? Create an account')),
    ])))),
  );
}

class Message {
  final String role;
  final String text;
  const Message({required this.role, required this.text});
}

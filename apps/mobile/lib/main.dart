import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

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
  final _controller = TextEditingController();
  final List<Message> _messages = [];
  List<dynamic> _conversations = [];
  String? _conversationId;
  String _provider = 'openai';
  bool _pending = false;
  String? _fileName;
  String? _fileId;
  String? _providerFileId;
  String? _analysis;

  @override
  void initState() {
    super.initState();
    _refreshConversations();
  }

  Future<void> _refreshConversations() async {
    try {
      final response = await http.get(Uri.parse('$apiBase/conversations')).timeout(const Duration(seconds: 20));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && mounted) setState(() => _conversations = data['conversations'] ?? []);
    } catch (_) { /* Keep the chat usable while the API is unavailable. */ }
  }

  Future<void> _openConversation(String id) async {
    final response = await http.get(Uri.parse('$apiBase/conversations/$id')).timeout(const Duration(seconds: 20));
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
    final response = await http.post(Uri.parse('$apiBase/conversations'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'provider': _provider})).timeout(const Duration(seconds: 20));
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
      final response = await http.post(Uri.parse('$apiBase/chat/single'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({
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
      final response = await http.post(Uri.parse('$apiBase/files/$_fileId/analyze')).timeout(const Duration(minutes: 2));
      final payload = jsonDecode(response.body);
      if (response.statusCode == 200 && mounted) setState(() => _analysis = payload['analysis']?['text'] ?? payload['analysis']?['error'] ?? '');
    } catch (error) {
      if (mounted) setState(() => _analysis = 'Analysis error: $error');
    }
  }

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF020403), Color(0xFF020807)], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(child: Text('Hephaestus', style: TextStyle(fontSize: 26, color: Color(0xFF27F5B8), fontWeight: FontWeight.bold))),
          IconButton(onPressed: _newConversation, icon: const Icon(Icons.add_comment_outlined), tooltip: 'New chat'),
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

class Message {
  final String role;
  final String text;
  const Message({required this.role, required this.text});
}

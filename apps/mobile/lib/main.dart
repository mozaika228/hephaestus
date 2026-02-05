import "dart:convert";

import "package:file_picker/file_picker.dart";
import "package:flutter/material.dart";
import "package:http/http.dart" as http;

const apiBase = "http://localhost:4000";

void main() {
  runApp(const HephaestusApp());
}

class HephaestusApp extends StatelessWidget {
  const HephaestusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "Hephaestus",
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF27F5B8)),
        useMaterial3: true,
      ),
      home: const ConsoleScreen(),
    );
  }
}

class ConsoleScreen extends StatefulWidget {
  const ConsoleScreen({super.key});

  @override
  State<ConsoleScreen> createState() => _ConsoleScreenState();
}

class _ConsoleScreenState extends State<ConsoleScreen> {
  final _controller = TextEditingController();
  final List<Message> _messages = [
    Message(role: "assistant", text: "Готов к работе. Что нужно?"),
  ];
  String _provider = "openai";
  bool _pending = false;
  String? _fileName;
  String? _fileId;
  String? _providerFileId;
  String? _analysis;

  Future<void> _sendMessage() async {
    if (_controller.text.trim().isEmpty || _pending) return;
    final text = _controller.text.trim();
    setState(() {
      _messages.add(Message(role: "user", text: text));
      _pending = true;
      _controller.clear();
    });

    final response = await http.post(
      Uri.parse("$apiBase/chat/single"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "message": text,
        "provider": _provider,
        "fileId": _providerFileId
      }),
    );

    if (response.statusCode == 200) {
      final payload = jsonDecode(response.body);
      setState(() {
        _messages.add(Message(role: "assistant", text: payload["text"] ?? ""));
      });
    } else {
      setState(() {
        _messages.add(Message(role: "assistant", text: "Ошибка ответа."));
      });
    }

    setState(() {
      _pending = false;
    });
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(withData: true);
    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    if (file.bytes == null) return;

    final request = http.MultipartRequest(
      "POST",
      Uri.parse("$apiBase/files/ingest"),
    );
    request.files.add(http.MultipartFile.fromBytes(
      "file",
      file.bytes!,
      filename: file.name,
    ));

    final response = await request.send();
    final body = await response.stream.bytesToString();
    final payload = jsonDecode(body);

    setState(() {
      _fileName = payload["file"]?["name"];
      _fileId = payload["file"]?["id"];
      _providerFileId = payload["file"]?["providerFileId"];
      _analysis = null;
    });
  }

  Future<void> _analyzeFile() async {
    if (_fileId == null) return;
    final response = await http.post(Uri.parse("$apiBase/files/$_fileId/analyze"));
    if (response.statusCode == 200) {
      final payload = jsonDecode(response.body);
      setState(() {
        _analysis = payload["analysis"]?["text"] ?? payload["analysis"]?["error"] ?? "";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF020403), Color(0xFF020807)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Hephaestus Mobile",
                  style: TextStyle(
                    fontSize: 26,
                    color: Color(0xFF27F5B8),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text("Мобильная консоль чата и файлов."),
                const SizedBox(height: 16),
                DropdownButton<String>(
                  value: _provider,
                  items: const [
                    DropdownMenuItem(value: "openai", child: Text("OpenAI")),
                    DropdownMenuItem(value: "azure", child: Text("Azure OpenAI")),
                    DropdownMenuItem(value: "local", child: Text("Local")),
                    DropdownMenuItem(value: "custom", child: Text("Custom")),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      _provider = value;
                    });
                  },
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView.builder(
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return Align(
                        alignment: message.role == "user"
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: message.role == "user"
                                ? const Color(0x3327F5B8)
                                : const Color(0xFF061412),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0x3327F5B8)),
                          ),
                          child: Text(message.text),
                        ),
                      );
                    },
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        decoration: const InputDecoration(
                          hintText: "Введите запрос...",
                        ),
                        onSubmitted: (_) => _sendMessage(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      onPressed: _pending ? null : _sendMessage,
                      child: Text(_pending ? "..." : "Отправить"),
                    )
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    OutlinedButton(
                      onPressed: _pickFile,
                      child: const Text("Загрузить файл"),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton(
                      onPressed: _analyzeFile,
                      child: const Text("Анализ"),
                    ),
                    const SizedBox(width: 12),
                    if (_fileName != null) Text("Файл: $_fileName")
                  ],
                ),
                if (_analysis != null) ...[
                  const SizedBox(height: 12),
                  Text("Анализ: $_analysis")
                ]
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class Message {
  final String role;
  final String text;

  Message({required this.role, required this.text});
}

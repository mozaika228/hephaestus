#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>

static std::string json_escape(const std::string& s) {
  std::string out;
  for (char c : s) {
    if (c == '"' || c == '\\') out.push_back('\\');
    out.push_back(c);
  }
  return out;
}

static bool extract_expression(const std::string& body, std::string& expr) {
  const std::string key = "\"expression\"";
  auto p = body.find(key);
  if (p == std::string::npos) return false;
  p = body.find(':', p);
  if (p == std::string::npos) return false;
  p = body.find('"', p);
  if (p == std::string::npos) return false;
  auto e = body.find('"', p + 1);
  if (e == std::string::npos) return false;
  expr = body.substr(p + 1, e - p - 1);
  return true;
}

class Parser {
 public:
  explicit Parser(const std::string& s) : s_(s), i_(0) {}
  bool parse(double& out) {
    skip();
    if (!expr(out)) return false;
    skip();
    return i_ == s_.size();
  }

 private:
  bool expr(double& out) {
    if (!term(out)) return false;
    while (true) {
      skip();
      if (peek('+')) {
        ++i_;
        double rhs;
        if (!term(rhs)) return false;
        out += rhs;
      } else if (peek('-')) {
        ++i_;
        double rhs;
        if (!term(rhs)) return false;
        out -= rhs;
      } else {
        break;
      }
    }
    return true;
  }

  bool term(double& out) {
    if (!factor(out)) return false;
    while (true) {
      skip();
      if (peek('*')) {
        ++i_;
        double rhs;
        if (!factor(rhs)) return false;
        out *= rhs;
      } else if (peek('/')) {
        ++i_;
        double rhs;
        if (!factor(rhs) || rhs == 0.0) return false;
        out /= rhs;
      } else {
        break;
      }
    }
    return true;
  }

  bool factor(double& out) {
    skip();
    if (peek('(')) {
      ++i_;
      if (!expr(out)) return false;
      skip();
      if (!peek(')')) return false;
      ++i_;
      return true;
    }
    return number(out);
  }

  bool number(double& out) {
    skip();
    size_t start = i_;
    if (peek('-')) ++i_;
    bool has_digit = false;
    while (i_ < s_.size() && isdigit(static_cast<unsigned char>(s_[i_]))) {
      has_digit = true;
      ++i_;
    }
    if (peek('.')) {
      ++i_;
      while (i_ < s_.size() && isdigit(static_cast<unsigned char>(s_[i_]))) {
        has_digit = true;
        ++i_;
      }
    }
    if (!has_digit) return false;
    out = std::stod(s_.substr(start, i_ - start));
    return true;
  }

  void skip() {
    while (i_ < s_.size() && isspace(static_cast<unsigned char>(s_[i_]))) ++i_;
  }

  bool peek(char c) const { return i_ < s_.size() && s_[i_] == c; }

  const std::string& s_;
  size_t i_;
};

static std::string make_http(const std::string& body, int code = 200) {
  std::ostringstream oss;
  oss << "HTTP/1.1 " << code << (code == 200 ? " OK" : " Bad Request") << "\r\n"
      << "Content-Type: application/json\r\n"
      << "Content-Length: " << body.size() << "\r\n"
      << "Connection: close\r\n\r\n"
      << body;
  return oss.str();
}

int main() {
  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    std::cerr << "socket failed\n";
    return 1;
  }

  int opt = 1;
  setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = INADDR_ANY;
  addr.sin_port = htons(8300);

  if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
    std::cerr << "bind failed: " << std::strerror(errno) << "\n";
    return 1;
  }

  if (listen(server_fd, 16) < 0) {
    std::cerr << "listen failed\n";
    return 1;
  }

  std::cout << "runtime-cpp listening on 8300\n";

  while (true) {
    int client = accept(server_fd, nullptr, nullptr);
    if (client < 0) continue;

    char buffer[8192];
    int n = read(client, buffer, sizeof(buffer) - 1);
    if (n <= 0) {
      close(client);
      continue;
    }
    buffer[n] = '\0';
    std::string req(buffer);

    std::string response;
    if (req.find("GET /health") == 0) {
      response = make_http("{\"status\":\"ok\",\"service\":\"runtime-cpp\"}");
    } else if (req.find("POST /exec/safe") == 0) {
      auto split = req.find("\r\n\r\n");
      std::string body = split == std::string::npos ? "" : req.substr(split + 4);
      std::string expr;
      if (!extract_expression(body, expr)) {
        response = make_http("{\"ok\":false,\"error\":\"expression is required\"}", 400);
      } else {
        Parser p(expr);
        double value = 0;
        if (!p.parse(value)) {
          response = make_http("{\"ok\":false,\"error\":\"invalid expression\"}", 400);
        } else {
          std::ostringstream json;
          json << "{\"ok\":true,\"expression\":\"" << json_escape(expr) << "\",\"result\":" << value << "}";
          response = make_http(json.str());
        }
      }
    } else {
      response = make_http("{\"ok\":false,\"error\":\"not found\"}", 400);
    }

    write(client, response.c_str(), response.size());
    close(client);
  }

  close(server_fd);
  return 0;
}

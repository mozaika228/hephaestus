package com.hephaestus.enterprise;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping
public class HealthController {

  @GetMapping("/health")
  public Map<String, Object> health() {
    return Map.of(
      "status", "ok",
      "service", "enterprise-java",
      "ts", Instant.now().toString()
    );
  }
}

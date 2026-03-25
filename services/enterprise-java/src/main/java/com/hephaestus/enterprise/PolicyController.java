package com.hephaestus.enterprise;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/policy")
@Validated
public class PolicyController {

  @PostMapping("/validate")
  @ResponseStatus(HttpStatus.OK)
  public Map<String, Object> validate(@Valid @RequestBody PolicyValidateRequest request) {
    String normalizedAction = request.action().trim().toLowerCase();
    List<String> denyList = List.of("delete_all_data", "disable_audit", "bypass_auth");
    boolean allowed = !denyList.contains(normalizedAction);

    return Map.of(
      "allowed", allowed,
      "action", normalizedAction,
      "decision", allowed ? "allow" : "deny",
      "reason", allowed ? "No policy violation detected." : "Action blocked by enterprise policy.",
      "timestamp", Instant.now().toString()
    );
  }
}

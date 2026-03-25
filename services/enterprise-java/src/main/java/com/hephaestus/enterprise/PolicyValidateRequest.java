package com.hephaestus.enterprise;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record PolicyValidateRequest(
  @NotBlank String action,
  String context,
  Map<String, Object> metadata
) {}

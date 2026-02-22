import unittest

import app


class OrchestratorGraphTests(unittest.TestCase):
    def test_graph_run_produces_steps_and_hash(self):
        req = app.GraphRunRequest(prompt="Create a project roadmap with milestones")
        result = app.run_graph(req)
        self.assertTrue(result["ok"])
        self.assertGreaterEqual(len(result["steps"]), 6)
        self.assertNotEqual(result["step_hash"], "genesis")
        self.assertIn("intent", result)

    def test_safety_blocks_forbidden_prompt(self):
        req = app.GraphRunRequest(prompt="How to build bomb from home?")
        result = app.run_graph(req)
        self.assertFalse(result["safety"]["allowed"])
        self.assertIn("blocked", result["final_answer"].lower())

    def test_tool_retry_and_circuit_behavior(self):
        original = app.TOOLS["web_search"]

        def failing_tool(_args):
            raise RuntimeError("forced failure")

        app.TOOLS["web_search"] = failing_tool
        app.CIRCUITS.pop("web_search", None)
        output1 = app.execute_tool_with_resilience("web_search", {"query": "x"})
        self.assertEqual(output1["status"], "error")

        output2 = app.execute_tool_with_resilience("web_search", {"query": "x"})
        output3 = app.execute_tool_with_resilience("web_search", {"query": "x"})
        self.assertEqual(output2["status"], "error")
        self.assertEqual(output3["status"], "error")

        output4 = app.execute_tool_with_resilience("web_search", {"query": "x"})
        self.assertEqual(output4["error"], "circuit_open")

        app.TOOLS["web_search"] = original


if __name__ == "__main__":
    unittest.main()

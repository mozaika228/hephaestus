import unittest

import app


class OrchestratorGraphTests(unittest.TestCase):
    def setUp(self):
        app.MEMORY_KNOWLEDGE.clear()

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

    def test_memory_ingest_and_hybrid_search(self):
        ingest = app.knowledge_ingest(
            app.KnowledgeIngestRequest(
                document_id="doc_test",
                content="LangGraph enables stateful workflows. Retrieval quality depends on indexing strategy.",
                metadata={"source": "unit-test"},
                chunk_size=6,
                chunk_overlap=1,
            )
        )
        self.assertTrue(ingest["ok"])
        self.assertGreaterEqual(ingest["ingested"], 2)

        search = app.knowledge_search(app.KnowledgeSearchRequest(query="LangGraph workflow", top_k=3))
        self.assertTrue(search["ok"])
        self.assertGreaterEqual(search["count"], 1)
        self.assertIn("LangGraph", search["results"][0]["content"])


if __name__ == "__main__":
    unittest.main()

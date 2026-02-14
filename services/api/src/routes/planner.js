import { createId } from "../store/ids.js";
import { createTask, getTask, listTasks, updateTask } from "../store/tasks.js";
import { errorJson } from "../http.js";

const validTaskStatuses = new Set(["open", "in_progress", "done", "cancelled"]);
const validPriorities = new Set(["low", "normal", "high", "urgent"]);

export function registerPlannerRoutes(app) {
  app.get("/planner/tasks", (req, res) => {
    res.json({ ok: true, tasks: listTasks() });
  });

  app.post("/planner/tasks", (req, res) => {
    const { title, dueAt, priority } = req.body || {};
    if (!title || typeof title !== "string") {
      res.status(400).json(errorJson("invalid_request", "title is required."));
      return;
    }
    if (priority && !validPriorities.has(priority)) {
      res.status(400).json(errorJson("invalid_request", "priority is invalid."));
      return;
    }
    const task = createTask({
      id: createId("task"),
      title: title.trim() || "Untitled task",
      dueAt: dueAt || null,
      priority: priority || "normal",
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true, task });
  });

  app.patch("/planner/tasks/:id", (req, res) => {
    const patch = req.body || {};
    if (patch.priority && !validPriorities.has(patch.priority)) {
      res.status(400).json(errorJson("invalid_request", "priority is invalid."));
      return;
    }
    if (patch.status && !validTaskStatuses.has(patch.status)) {
      res.status(400).json(errorJson("invalid_request", "status is invalid."));
      return;
    }
    const task = updateTask(req.params.id, patch);
    if (!task) {
      res.status(404).json(errorJson("not_found", "Task not found."));
      return;
    }
    res.json({ ok: true, task });
  });

  app.get("/planner/tasks/:id", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json(errorJson("not_found", "Task not found."));
      return;
    }
    res.json({ ok: true, task });
  });
}

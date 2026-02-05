import { createId } from "../store/ids.js";
import { createTask, getTask, listTasks, updateTask } from "../store/tasks.js";

export function registerPlannerRoutes(app) {
  app.get("/planner/tasks", (req, res) => {
    res.json({ ok: true, tasks: listTasks() });
  });

  app.post("/planner/tasks", (req, res) => {
    const { title, dueAt, priority } = req.body || {};
    const task = createTask({
      id: createId("task"),
      title: title || "Untitled task",
      dueAt: dueAt || null,
      priority: priority || "normal",
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true, task });
  });

  app.patch("/planner/tasks/:id", (req, res) => {
    const task = updateTask(req.params.id, req.body || {});
    if (!task) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, task });
  });

  app.get("/planner/tasks/:id", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, task });
  });
}

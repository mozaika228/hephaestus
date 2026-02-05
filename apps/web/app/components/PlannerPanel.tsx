"use client";

import { useEffect, useMemo, useState } from "react";

export default function PlannerPanel() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    []
  );
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");

  const loadTasks = async () => {
    const response = await fetch(`${apiBase}/planner/tasks`);
    const payload = await response.json();
    if (payload.ok) setTasks(payload.tasks || []);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const addTask = async () => {
    if (!title.trim()) return;
    const response = await fetch(`${apiBase}/planner/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() })
    });
    const payload = await response.json();
    if (payload.ok) {
      setTitle("");
      loadTasks();
    }
  };

  return (
    <section className="planner">
      <div className="planner-head">
        <h3>Планировщик</h3>
        <p>Создавай задачи и синхронизируй с интеграциями.</p>
      </div>
      <div className="planner-body">
        <div className="planner-input">
          <input
            placeholder="Новая задача"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? addTask() : null)}
          />
          <button className="primary" onClick={addTask}>
            Добавить
          </button>
        </div>
        <div className="planner-list">
          {tasks.map((task) => (
            <div key={task.id} className="planner-item">
              <span>{task.title}</span>
              <span className="planner-status">{task.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

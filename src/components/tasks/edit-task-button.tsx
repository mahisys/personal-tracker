"use client";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/client/modal";
import type { ProjectOption } from "@/server/tasks/queries";
import { TaskForm, type TaskFormValues } from "./task-form";

export function EditTaskButton({ values, projects, taskTypes }: { values: TaskFormValues; projects: ProjectOption[]; taskTypes: string[] }) {
  return (
    <Modal
      trigger={
        <>
          <Pencil className="h-4 w-4" /> Edit
        </>
      }
      title="Edit task"
      variant="secondary"
      wide
    >
      <TaskForm values={values} projects={projects} taskTypes={taskTypes} />
    </Modal>
  );
}

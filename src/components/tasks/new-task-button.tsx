"use client";
import { Plus } from "lucide-react";
import { Modal } from "@/components/client/modal";
import type { ProjectOption } from "@/server/tasks/queries";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { TaskForm, type TaskFormValues } from "./task-form";

export function NewTaskButton({
  projects,
  taskTypes,
  values,
  defaultOpen,
  label = "New task",
  variant = "primary",
  size = "md",
}: {
  projects: ProjectOption[];
  taskTypes?: string[];
  values?: TaskFormValues;
  defaultOpen?: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> {label}
        </>
      }
      title="New task"
      description="Capture it now, sort it later."
      defaultOpen={defaultOpen}
      variant={variant}
      size={size}
      wide
    >
      <TaskForm projects={projects} taskTypes={taskTypes} values={values} />
    </Modal>
  );
}

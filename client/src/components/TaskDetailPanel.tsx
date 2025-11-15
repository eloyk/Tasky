import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Paperclip, MessageSquare, Trash2, X, Upload } from "lucide-react";
import { Task, Comment, Attachment, insertCommentSchema } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ObjectUploader } from "./ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

interface TaskDetailPanelProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onDelete: (taskId: string) => void;
}

export function TaskDetailPanel({ task, open, onClose, onDelete }: TaskDetailPanelProps) {
  const [commentText, setCommentText] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/tasks", task?.id, "comments"],
    enabled: !!task,
  });

  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: ["/api/tasks", task?.id, "attachments"],
    enabled: !!task,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!task) return;
      await apiRequest("POST", `/api/tasks/${task.id}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "comments"] });
      setCommentText("");
      toast({
        title: "Comentario agregado",
        description: "El comentario se ha agregado correctamente.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "No autorizado",
          description: "Redirigiendo al inicio de sesión...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo agregar el comentario.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to get upload URL");
      const data = await response.json();
      return {
        method: "PUT" as const,
        url: data.uploadURL,
        objectPath: data.objectPath,
      };
    },
  });

  const attachmentMutation = useMutation({
    mutationFn: async (data: { objectPath: string; fileName: string; fileSize: number; mimeType: string }) => {
      if (!task) return;
      await apiRequest("POST", `/api/tasks/${task.id}/attachments`, {
        fileName: data.fileName,
        objectPath: data.objectPath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "attachments"] });
      toast({
        title: "Archivo adjuntado",
        description: "El archivo se ha adjuntado correctamente.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "No autorizado",
          description: "Redirigiendo al inicio de sesión...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo adjuntar el archivo.",
        variant: "destructive",
      });
    },
  });

  const handleAddComment = () => {
    if (commentText.trim() && task) {
      createCommentMutation.mutate(commentText);
    }
  };

  const handleUploadComplete = (result: { successful: Array<{ uploadURL: string; objectPath: string; name: string; size: number; type: string }> }) => {
    if (result.successful && result.successful.length > 0) {
      for (const file of result.successful) {
        attachmentMutation.mutate({
          objectPath: file.objectPath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
      }
    }
  };

  const handleDelete = () => {
    if (task) {
      onDelete(task.id);
      setShowDeleteDialog(false);
      onClose();
    }
  };

  if (!task) return null;

  const priorityColors = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-accent text-accent-foreground",
    high: "bg-destructive/90 text-destructive-foreground",
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-[500px] p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <SheetTitle className="text-2xl font-semibold pr-8">{task.title}</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-panel"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6">
            <div className="space-y-6 pb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs px-3 py-1 rounded-full ${priorityColors[task.priority]}`}>
                  {task.priority === "low" ? "Baja" : task.priority === "medium" ? "Media" : "Alta"}
                </Badge>
                {task.dueDate && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="font-mono">{format(new Date(task.dueDate), "MMM dd, yyyy")}</span>
                  </div>
                )}
              </div>

              {task.description && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Descripción</h4>
                  <p className="text-sm text-muted-foreground leading-normal whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>
              )}

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Archivos Adjuntos ({attachments.length})
                </h4>
                <div className="space-y-2 mb-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 p-3 bg-muted/30 rounded-md text-sm"
                      data-testid={`attachment-${attachment.id}`}
                    >
                      <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">{attachment.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        {attachment.fileSize ? `${Math.round(parseInt(attachment.fileSize) / 1024)} KB` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={10485760}
                  onGetUploadParameters={() => uploadMutation.mutateAsync()}
                  onComplete={handleUploadComplete}
                  buttonClassName="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Adjuntar Archivo
                </ObjectUploader>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Comentarios ({comments.length})
                </h4>
                <div className="space-y-4 mb-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="space-y-1" data-testid={`comment-${comment.id}`}>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {comment.userId.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(new Date(comment.createdAt!), "MMM dd, HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm pl-8 leading-normal whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Agregar un comentario..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-20 resize-none"
                    data-testid="input-comment"
                  />
                  <Button
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || createCommentMutation.isPending}
                    className="w-full"
                    data-testid="button-add-comment"
                  >
                    {createCommentMutation.isPending ? "Agregando..." : "Agregar Comentario"}
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="border-t border-border p-4 bg-card sticky bottom-0">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              className="w-full"
              data-testid="button-delete-task"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar Tarea
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la tarea "{task.title}" y todos sus comentarios y archivos adjuntos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Upload, User } from "lucide-react";

const profileFormSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido").max(100),
  lastName: z.string().min(1, "El apellido es requerido").max(100),
  profileImageUrl: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  }>({
    queryKey: ['/api/auth/user'],
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      profileImageUrl: user?.profileImageUrl || "",
    },
    values: user ? {
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      profileImageUrl: user.profileImageUrl || "",
    } : undefined,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      return await apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Perfil actualizado",
        description: "Tu perfil se ha actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el perfil",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo de imagen",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "La imagen no debe superar 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await fetch('/api/user/profile-image/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadResponse.ok) {
        throw new Error('Error al subir la imagen');
      }

      const { imageUrl } = await uploadResponse.json();

      form.setValue('profileImageUrl', imageUrl, { shouldDirty: true });
      
      toast({
        title: "Imagen cargada",
        description: "La foto de perfil se ha cargado correctamente.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo cargar la imagen",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-settings" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No se pudo cargar el perfil</p>
      </div>
    );
  }

  const userInitials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase();

  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-settings">Configuración</h1>
          <p className="text-muted-foreground mt-2">
            Administra tu perfil y preferencias de la cuenta
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Perfil Personal</CardTitle>
            <CardDescription>
              Actualiza tu información personal y foto de perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24" data-testid="avatar-profile">
                <AvatarImage src={form.watch('profileImageUrl') || undefined} alt={user.email} />
                <AvatarFallback className="text-2xl">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => document.getElementById('profile-image')?.click()}
                  data-testid="button-upload-image"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Cambiar foto
                </Button>
                <Input
                  id="profile-image"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG o GIF. Máximo 5MB.
                </p>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Juan"
                            {...field}
                            data-testid="input-firstname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellido</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Pérez"
                            {...field}
                            data-testid="input-lastname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <Label>Correo electrónico</Label>
                  <Input
                    value={user.email}
                    disabled
                    className="bg-muted"
                    data-testid="input-email-disabled"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    El correo electrónico no puede ser modificado
                  </p>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending || !form.formState.isDirty}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seguridad</CardTitle>
            <CardDescription>
              Administra la seguridad de tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Contraseña</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Para cambiar tu contraseña, debes hacerlo a través del sistema de autenticación
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(
                      import.meta.env.VITE_KEYCLOAK_URL || 
                      `${window.location.origin}/auth/account`,
                      '_blank'
                    );
                  }}
                  data-testid="button-change-password"
                >
                  <User className="h-4 w-4 mr-2" />
                  Administrar cuenta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

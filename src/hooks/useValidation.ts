import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
       createValidation,
       getValidation,
       listValidations,
       deleteValidation,
       ValidationRequest,
} from "@/services/validationService";

// Query Keys
export const validationKeys = {
       all: ["validations"] as const,
       lists: () => [...validationKeys.all, "list"] as const,
       detail: (id: string) => [...validationKeys.all, "detail", id] as const,
};

// Hook to fetch a single validation report
export const useValidation = (id: string | undefined) => {
       return useQuery({
              queryKey: validationKeys.detail(id || ""),
              queryFn: () => getValidation(id!),
              enabled: !!id,
              staleTime: 1000 * 60 * 5, // 5 minutes
       });
};

// Hook to fetch list of validations
export const useValidations = (userId: string | undefined) => {
       return useQuery({
              queryKey: validationKeys.lists(),
              queryFn: listValidations,
              enabled: !!userId,
              staleTime: 1000 * 60 * 1, // 1 minute
       });
};

// Hook to create a validation
export const useCreateValidation = () => {
       const queryClient = useQueryClient();

       return useMutation({
              mutationFn: (request: ValidationRequest) => createValidation(request),
              onSuccess: () => {
                     queryClient.invalidateQueries({ queryKey: validationKeys.lists() });
              },
       });
};

// Hook to delete a validation
export const useDeleteValidation = () => {
       const queryClient = useQueryClient();

       return useMutation({
              mutationFn: (id: string) => deleteValidation(id),
              onSuccess: () => {
                     queryClient.invalidateQueries({ queryKey: validationKeys.lists() });
              },
       });
};

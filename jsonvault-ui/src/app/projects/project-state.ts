export interface ProjectActionState {
  status: "idle" | "error";
  message: string;
  values: {
    displayName: string;
  };
}

export const initialProjectActionState: ProjectActionState = {
  status: "idle",
  message: "",
  values: {
    displayName: "",
  },
};

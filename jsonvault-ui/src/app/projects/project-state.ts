export interface ProjectActionState {
  status: "idle" | "error";
  message: string;
  values: {
    displayName: string;
    database: string;
  };
}

export const initialProjectActionState: ProjectActionState = {
  status: "idle",
  message: "",
  values: {
    displayName: "",
    database: "",
  },
};

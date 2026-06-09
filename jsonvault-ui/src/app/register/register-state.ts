export interface RegisterActionState {
  status: "idle" | "error";
  message: string;
  values: {
    name: string;
    email: string;
  };
}

export const initialRegisterActionState: RegisterActionState = {
  status: "idle",
  message: "",
  values: {
    name: "",
    email: "",
  },
};

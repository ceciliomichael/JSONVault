export interface LoginActionState {
  status: "idle" | "error";
  message: string;
  email: string;
}

export const initialLoginActionState: LoginActionState = {
  status: "idle",
  message: "",
  email: "",
};

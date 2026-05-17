// TODO [ ]: replace these placeholder types with shared domain types

export type UserRole = "USER" | "STREAMER" | "COMPANY" | "ADMIN";

export type AnonymousProfile = {
  anonymousId: string;
  role: UserRole;
};

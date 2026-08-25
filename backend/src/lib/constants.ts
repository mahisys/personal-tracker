// Application-level enums. These mirror the value sets originally modeled as Prisma `enum`
// blocks in schema.prisma, but SQLite's connector doesn't support Prisma enums, so the
// database columns are plain strings and these values are enforced here + via zod instead.

export const TaskStatus = {
  YTS: 'YTS',
  WIP: 'WIP',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const CollaboratorRole = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;
export type CollaboratorRole = (typeof CollaboratorRole)[keyof typeof CollaboratorRole];

export const AttachmentType = {
  FILE: 'FILE',
  LINK: 'LINK',
} as const;
export type AttachmentType = (typeof AttachmentType)[keyof typeof AttachmentType];

export const NotificationType = {
  REMINDER: 'REMINDER',
  SHARE_INVITE: 'SHARE_INVITE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  COMMENT: 'COMMENT',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const Platform = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  WEB: 'WEB',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

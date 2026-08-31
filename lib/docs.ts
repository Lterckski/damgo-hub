/** Shared serialization for Doc API responses — see 09-documentation.md. */
export interface SerializedDoc {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  projectId: string | null;
  driveFileId: string | null;
  driveFileName: string | null;
  driveFileMimeType: string | null;
  driveFileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedDocAttachment {
  id: string;
  fileName: string;
  createdAt: string;
}

export function serializeDoc(doc: {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author: { displayName: string };
  projectId: string | null;
  driveFileId: string | null;
  driveFileName: string | null;
  driveFileMimeType: string | null;
  driveFileUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SerializedDoc {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    authorId: doc.authorId,
    authorName: doc.author.displayName,
    projectId: doc.projectId,
    driveFileId: doc.driveFileId,
    driveFileName: doc.driveFileName,
    driveFileMimeType: doc.driveFileMimeType,
    driveFileUrl: doc.driveFileUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeAttachment(attachment: {
  id: string;
  fileName: string;
  createdAt: Date;
}): SerializedDocAttachment {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    createdAt: attachment.createdAt.toISOString(),
  };
}

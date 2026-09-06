-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "visibilityScope" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "ProjectMilestone" ADD COLUMN     "blockedReason" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "visibilityScope" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN     "acceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HubWorkspace" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "orgId" TEXT NOT NULL,

    CONSTRAINT "HubWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMembership" (
    "memberId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "HubMembership_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "HubRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ownerId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceCreatedAt" TIMESTAMP(3),
    "searchVector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', "title"), 'A') || setweight(to_tsvector('simple', "body"), 'B')) STORED,

    CONSTRAINT "HubRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubGrant" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "visibilityScope" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "HubGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNotification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "visibilityScope" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNotificationState" (
    "notificationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "emailPending" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HubNotificationState_pkey" PRIMARY KEY ("notificationId","memberId")
);

-- CreateTable
CREATE TABLE "HubPreference" (
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HubPreference_pkey" PRIMARY KEY ("orgId","memberId","type")
);

-- CreateTable
CREATE TABLE "HubRecent" (
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubRecent_pkey" PRIMARY KEY ("orgId","memberId","recordId")
);

-- CreateTable
CREATE TABLE "HubComment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubWorkspace_orgId_key" ON "HubWorkspace"("orgId");

-- CreateIndex
CREATE INDEX "HubMembership_orgId_idx" ON "HubMembership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "HubRecord_orgId_entityType_entityId_key" ON "HubRecord"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "HubGrant_recordId_idx" ON "HubGrant"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "HubNotification_eventKey_key" ON "HubNotification"("eventKey");

-- CreateIndex
CREATE INDEX "HubNotification_orgId_createdAt_idx" ON "HubNotification"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "HubNotificationState_memberId_readAt_idx" ON "HubNotificationState"("memberId", "readAt");

-- CreateIndex
CREATE INDEX "HubRecent_orgId_memberId_lastOpenedAt_idx" ON "HubRecent"("orgId", "memberId", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "HubComment_recordId_createdAt_idx" ON "HubComment"("recordId", "createdAt");

-- AddForeignKey
ALTER TABLE "HubGrant" ADD CONSTRAINT "HubGrant_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "HubRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotification" ADD CONSTRAINT "HubNotification_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "HubRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotificationState" ADD CONSTRAINT "HubNotificationState_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "HubNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubRecent" ADD CONSTRAINT "HubRecent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "HubRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubComment" ADD CONSTRAINT "HubComment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "HubRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "HubRecord_fts" ON "HubRecord" USING GIN ("searchVector");
CREATE INDEX "HubRecord_trgm" ON "HubRecord" USING GIN (lower("title") gin_trgm_ops);
ALTER TABLE "Task" ADD CONSTRAINT "Task_scope_check" CHECK ("visibilityScope" IN ('user','org','project') AND ("visibilityScope" <> 'project' OR "projectId" IS NOT NULL));
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_scope_check" CHECK ("visibilityScope" IN ('user','org'));
ALTER TABLE "HubGrant" ADD CONSTRAINT "HubGrant_scope_check" CHECK (("visibilityScope" = 'org' AND "recipientId" = '') OR ("visibilityScope" IN ('user','role','project') AND "recipientId" <> ''));
ALTER TABLE "HubNotification" ADD CONSTRAINT "HubNotification_scope_check" CHECK (("visibilityScope" = 'org' AND "recipientId" = '') OR ("visibilityScope" IN ('user','role','project') AND "recipientId" <> ''));
-- Preserve legacy unassigned tasks' existing whole-team meaning. A named
-- list, even today's entire roster, stays a list of named recipients.
UPDATE "Task" SET "visibilityScope" = 'org' WHERE NOT EXISTS (SELECT 1 FROM "TaskAssignee" a WHERE a."taskId"="Task".id);

CREATE FUNCTION hub_audience(scope text, recipient text, member_id text, member_role text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE scope WHEN 'org' THEN recipient = '' WHEN 'user' THEN recipient = member_id
 WHEN 'role' THEN recipient = member_role WHEN 'project' THEN
 EXISTS (SELECT 1 FROM "Project" p WHERE p.id=recipient AND (p."ownerId"=member_id OR EXISTS (SELECT 1 FROM "ProjectMember" pm WHERE pm."projectId"=p.id AND pm."memberId"=member_id))) ELSE false END
$$;

CREATE FUNCTION hub_emit(record_id text, event_action text, revision text, only_scope text DEFAULT NULL, only_recipient text DEFAULT NULL, actor_id text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "HubRecord"; g record; notification_id text; event_key text;
BEGIN
 SELECT * INTO r FROM "HubRecord" WHERE id=record_id;
 IF NOT FOUND OR r."orgId"='' OR current_setting('hub.backfill',true)='on' THEN RETURN; END IF;
 FOR g IN SELECT "visibilityScope", "recipientId" FROM "HubGrant" WHERE "recordId"=record_id AND
 (only_scope IS NULL OR ("visibilityScope"=only_scope AND (only_recipient IS NULL OR "recipientId"=only_recipient)))
 UNION SELECT 'user',only_recipient WHERE only_scope='user' AND only_recipient IS NOT NULL AND EXISTS (SELECT 1 FROM "HubMembership" m JOIN "HubGrant" access ON access."recordId"=record_id WHERE m."memberId"=only_recipient AND m."orgId"=r."orgId" AND hub_audience(access."visibilityScope",access."recipientId",m."memberId",m.role)) LOOP
 -- Personal decisions never become admin notifications just because an
 -- admin has permission to review the underlying financial record.
 IF g."visibilityScope"='role' AND event_action NOT IN ('transaction.pending','broadcast.posted') THEN CONTINUE; END IF;
 event_key := record_id || ':' || event_action || ':' || revision || ':' || g."visibilityScope" || ':' || g."recipientId";
 notification_id := md5(event_key);
 INSERT INTO "HubNotification" (id,"orgId","recordId","visibilityScope","recipientId","actorId",action,title,body,url,"eventKey")
 VALUES (notification_id,r."orgId",r.id,g."visibilityScope",g."recipientId",actor_id,event_action,r.title,r.body,'/records/'||r.id,event_key)
 ON CONFLICT ("eventKey") DO NOTHING;
 IF NOT FOUND THEN CONTINUE; END IF;
 INSERT INTO "HubNotificationState" ("notificationId","memberId",suppressed,"emailPending")
 SELECT notification_id,m."memberId",NOT coalesce(p.enabled,true),coalesce(p.enabled,true) AND coalesce(p.email,event_action='meeting.starting') AND (split_part(event_action,'.',1)<>'meeting' OR event_action='meeting.starting')
 FROM "HubMembership" m LEFT JOIN "HubPreference" p ON p."orgId"=m."orgId" AND p."memberId"=m."memberId" AND p.type=split_part(event_action,'.',1)
 WHERE m."orgId"=r."orgId" AND hub_audience(g."visibilityScope",g."recipientId",m."memberId",m.role)
 ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

CREATE FUNCTION hub_refresh(source_table text, source_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item jsonb; previous "HubRecord"; rid text; kind text; title text; body text; owner_id text; project_id text; status text; due_at timestamp; created_at timestamp; updated_at timestamp; scope text; target text; old_users text[]; new_users text[]; uid text;
BEGIN
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1',source_table) INTO item USING source_id;
 kind := CASE source_table WHEN 'Task' THEN 'task' WHEN 'Penalty' THEN 'penalty' WHEN 'Transaction' THEN 'transaction' WHEN 'Project' THEN 'project' WHEN 'Meeting' THEN 'meeting' WHEN 'Doc' THEN 'document' WHEN 'Member' THEN 'member' WHEN 'Announcement' THEN 'announcement' WHEN 'Broadcast' THEN 'broadcast' END;
 IF kind IS NULL THEN RETURN; END IF;
 rid := kind || ':' || source_id;
 SELECT * INTO previous FROM "HubRecord" WHERE id=rid;
 IF item IS NULL THEN DELETE FROM "HubRecord" WHERE id=rid; RETURN; END IF;
 SELECT coalesce(array_agg("recipientId"),ARRAY[]::text[]) INTO old_users FROM "HubGrant" WHERE "recordId"=rid AND "visibilityScope"='user';
 title := coalesce(item->>'title',item->>'name',item->>'displayName',item->>'reason',item->>'subject',item->>'category','Record');
 body := coalesce(item->>'description',item->>'content',item->>'body',item->>'reason','');
 IF kind='meeting' THEN body:=concat_ws(E'\n',nullif(body,''),item->>'location',item->>'meetingUrl'); END IF;
 IF kind='transaction' THEN title := title || ' · ₱' || to_char((item->>'amount')::numeric/100,'FM9999999990.00'); END IF;
 owner_id := coalesce(item->>'ownerId',item->>'authorId',item->>'createdById',item->>'memberId',item->>'organizerId',item->>'sentById');
 project_id := item->>'projectId';
 status := coalesce(item->>'status',CASE WHEN kind='announcement' THEN CASE WHEN (item->>'pinned')::boolean THEN 'Pinned' ELSE 'Archived' END ELSE 'Published' END);
 due_at := coalesce(item->>'dueDate',item->>'dueAt',item->>'scheduledAt')::timestamp;
 IF kind='penalty' AND due_at IS NULL THEN due_at := (item->>'createdAt')::timestamp + make_interval(days=>coalesce((SELECT "penaltyDueDays" FROM "OrgSettings" WHERE id='singleton'),14)); END IF;
 created_at := (item->>'createdAt')::timestamp; updated_at := coalesce(item->>'updatedAt',item->>'createdAt')::timestamp;
 INSERT INTO "HubRecord" (id,"orgId","entityType","entityId",title,body,"ownerId","projectId",status,"dueAt","createdAt","updatedAt","sourceCreatedAt")
 VALUES (rid,coalesce((SELECT "orgId" FROM "HubWorkspace" WHERE id='singleton'),''),kind,source_id,title,body,owner_id,project_id,status,due_at,created_at,updated_at,created_at)
 ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,"ownerId"=EXCLUDED."ownerId","projectId"=EXCLUDED."projectId",status=EXCLUDED.status,"dueAt"=EXCLUDED."dueAt","updatedAt"=EXCLUDED."updatedAt";
 DELETE FROM "HubGrant" WHERE "recordId"=rid;
 scope := 'org'; target := '';
 IF kind='task' THEN
 scope := item->>'visibilityScope';
 IF scope='project' THEN target:=project_id; END IF;
 IF scope='user' THEN SELECT array_agg("memberId") INTO new_users FROM "TaskAssignee" WHERE "taskId"=source_id; END IF;
 ELSIF kind IN ('penalty','transaction') THEN
 scope:='user'; new_users:=ARRAY[owner_id];
 INSERT INTO "HubGrant" VALUES (rid||':role',rid,'role','org:admin');
 ELSIF kind='project' THEN scope:='project';target:=source_id;
 ELSIF kind='document' AND project_id IS NOT NULL THEN scope:='project';target:=project_id;
 ELSIF kind='meeting' AND item->>'visibilityScope'<>'org' THEN
 scope:='user'; SELECT array_agg("memberId") INTO new_users FROM "MeetingParticipant" WHERE "meetingId"=source_id;
 INSERT INTO "HubGrant" VALUES (rid||':role',rid,'role','org:admin');
 ELSIF kind='broadcast' THEN
 scope:='user'; SELECT array_agg("memberId") INTO new_users FROM "BroadcastRecipient" WHERE "broadcastId"=source_id;
 END IF;
 IF scope='user' THEN
 FOREACH uid IN ARRAY coalesce(new_users,ARRAY[]::text[]) LOOP INSERT INTO "HubGrant" VALUES(rid||':user:'||uid,rid,'user',uid); END LOOP;
 ELSE INSERT INTO "HubGrant" VALUES(rid||':'||scope,rid,scope,target); END IF;
 IF kind IN ('task','meeting','broadcast') THEN
 FOR uid IN SELECT "recipientId" FROM "HubGrant" WHERE "recordId"=rid AND "visibilityScope"='user' AND NOT ("recipientId"=ANY(old_users)) LOOP
 PERFORM hub_emit(rid,CASE kind WHEN 'task' THEN 'task.assigned' WHEN 'meeting' THEN 'meeting.scheduled' ELSE 'broadcast.posted' END,updated_at::text||':'||txid_current()::text,'user',uid,owner_id);
 END LOOP;
 END IF;
 IF previous.id IS NULL THEN
 IF kind='task' AND scope<>'user' THEN PERFORM hub_emit(rid,'task.assigned',updated_at::text,scope,NULL,owner_id);
 ELSIF kind='meeting' AND scope='org' THEN PERFORM hub_emit(rid,'meeting.scheduled',updated_at::text,'org',NULL,owner_id);
 ELSIF kind='penalty' THEN PERFORM hub_emit(rid,'penalty.issued',updated_at::text,'user',NULL,item->>'issuedById');
 ELSIF kind='transaction' AND status='PENDING' THEN PERFORM hub_emit(rid,'transaction.pending',updated_at::text,'role',NULL,owner_id);
 ELSIF kind='announcement' THEN PERFORM hub_emit(rid,'announcement.posted',updated_at::text,NULL,NULL,owner_id); END IF;
 ELSE
 IF kind='transaction' AND status<>previous.status AND status IN ('APPROVED','REJECTED') THEN PERFORM hub_emit(rid,'transaction.'||lower(status),updated_at::text,'user');
 ELSIF kind='meeting' AND (title<>previous.title OR body<>previous.body OR due_at IS DISTINCT FROM previous."dueAt") THEN PERFORM hub_emit(rid,'meeting.changed',updated_at::text,NULL,NULL,owner_id);
 ELSIF kind='task' AND scope<>'user' AND (previous."projectId" IS DISTINCT FROM project_id OR NOT EXISTS(SELECT 1 FROM "HubNotification" WHERE "recordId"=rid AND action='task.assigned' AND "visibilityScope"=scope)) THEN PERFORM hub_emit(rid,'task.assigned',updated_at::text,scope,NULL,owner_id);
 END IF;
 END IF;
END $$;

CREATE FUNCTION hub_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_table text; source_id text;
BEGIN
 source_table:=coalesce(TG_ARGV[0],TG_TABLE_NAME);
 IF TG_ARGV[1] IS NOT NULL THEN source_id:=coalesce(to_jsonb(NEW)->>TG_ARGV[1],to_jsonb(OLD)->>TG_ARGV[1]);
 ELSE source_id:=coalesce(NEW.id,OLD.id); END IF;
 PERFORM hub_refresh(source_table,source_id);
 IF TG_OP='UPDATE' AND TG_ARGV[1] IS NOT NULL AND (to_jsonb(OLD)->>TG_ARGV[1]) IS DISTINCT FROM source_id THEN
 PERFORM hub_refresh(source_table,to_jsonb(OLD)->>TG_ARGV[1]);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER "hub_Task" AFTER INSERT OR UPDATE OR DELETE ON "Task" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Penalty" AFTER INSERT OR UPDATE OR DELETE ON "Penalty" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Transaction" AFTER INSERT OR UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Project" AFTER INSERT OR UPDATE OR DELETE ON "Project" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Meeting" AFTER INSERT OR UPDATE OR DELETE ON "Meeting" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Doc" AFTER INSERT OR UPDATE OR DELETE ON "Doc" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Member" AFTER INSERT OR UPDATE OR DELETE ON "Member" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Announcement" AFTER INSERT OR UPDATE OR DELETE ON "Announcement" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_Broadcast" AFTER INSERT OR UPDATE OR DELETE ON "Broadcast" FOR EACH ROW EXECUTE FUNCTION hub_source_changed();
CREATE TRIGGER "hub_TaskAssignee" AFTER INSERT OR UPDATE OR DELETE ON "TaskAssignee" FOR EACH ROW EXECUTE FUNCTION hub_source_changed('Task','taskId');
CREATE TRIGGER "hub_MeetingParticipant" AFTER INSERT OR UPDATE OR DELETE ON "MeetingParticipant" FOR EACH ROW EXECUTE FUNCTION hub_source_changed('Meeting','meetingId');
CREATE TRIGGER "hub_BroadcastRecipient" AFTER INSERT OR UPDATE OR DELETE ON "BroadcastRecipient" FOR EACH ROW EXECUTE FUNCTION hub_source_changed('Broadcast','broadcastId');

-- A migration is a projection rebuild, never a replay of old email/events.
DO $$ DECLARE t text; r record; BEGIN
 PERFORM set_config('hub.backfill','on',true);
 FOREACH t IN ARRAY ARRAY['Task','Penalty','Transaction','Project','Meeting','Doc','Member','Announcement','Broadcast'] LOOP
 FOR r IN EXECUTE format('SELECT id FROM %I',t) LOOP PERFORM hub_refresh(t,r.id); END LOOP;
 END LOOP;
END $$;

-- One-edit fallback guarantees typo recall even where a short word shares
-- too few trigrams. Operates on individual title words, never body text.
CREATE FUNCTION hub_one_edit(a text,b text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE i int:=1; j int:=1; mistakes int:=0; la int:=length(a); lb int:=length(b);
BEGIN
 IF abs(la-lb)>1 THEN RETURN false; END IF;
 WHILE i<=la AND j<=lb LOOP
 IF substr(a,i,1)=substr(b,j,1) THEN i:=i+1;j:=j+1;
 ELSE mistakes:=mistakes+1;IF mistakes>1 THEN RETURN false;END IF;
 IF la>=lb THEN i:=i+1;END IF; IF lb>=la THEN j:=j+1;END IF;
 END IF;
 END LOOP;
 RETURN mistakes + (la-i+1) + (lb-j+1) <= 1;
END $$;

CREATE FUNCTION hub_comment_created() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text; recipient text;
BEGIN
 SELECT "ownerId" INTO owner_id FROM "HubRecord" WHERE id=NEW."recordId";
 IF owner_id IS NOT NULL AND owner_id<>NEW."authorId" THEN PERFORM hub_emit(NEW."recordId",'comment.posted',NEW.id,'user',owner_id,NEW."authorId"); END IF;
 FOREACH recipient IN ARRAY NEW.mentions LOOP
 IF recipient<>NEW."authorId" THEN PERFORM hub_emit(NEW."recordId",'mention.created',NEW.id,'user',recipient,NEW."authorId"); END IF;
 END LOOP;
 -- Notification snippets are the comment, not a repeated document body.
 UPDATE "HubNotification" SET body=NEW.body WHERE "recordId"=NEW."recordId" AND "eventKey" LIKE NEW."recordId"||':%:'||NEW.id||':%';
 RETURN NULL;
END $$;
CREATE TRIGGER hub_comment AFTER INSERT ON "HubComment" FOR EACH ROW EXECUTE FUNCTION hub_comment_created();

-- Milestone state changes emit in the same transaction, including writes
-- outside the header. Repeating a completed/blocked value does not replay it.
CREATE FUNCTION hub_milestone_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_action text; rid text; revision text;
BEGIN
 IF NEW."completedAt" IS NOT NULL AND OLD."completedAt" IS NULL THEN event_action:='project.milestone_reached';
 ELSIF NEW."blockedReason" IS NOT NULL AND NEW."blockedReason" IS DISTINCT FROM OLD."blockedReason" THEN event_action:='project.milestone_blocked';
 ELSE RETURN NULL; END IF;
 rid:='project:'||NEW."projectId";
 revision:=NEW.id||':'||txid_current()::text;
 PERFORM hub_emit(rid,event_action,revision,'project');
 UPDATE "HubNotification" SET body=NEW.title||CASE WHEN event_action='project.milestone_blocked' THEN ': '||NEW."blockedReason" ELSE ' completed' END
 WHERE "recordId"=rid AND action=event_action AND "eventKey"=rid||':'||event_action||':'||revision||':project:'||NEW."projectId";
 RETURN NULL;
END $$;
CREATE TRIGGER "hub_ProjectMilestone" AFTER UPDATE ON "ProjectMilestone" FOR EACH ROW EXECUTE FUNCTION hub_milestone_changed();

-- Project deletion already detaches tasks through ON DELETE SET NULL.
-- Preserve the former project audience as named recipients before that FK
-- action; never turn a deleted project's private tasks into org-wide tasks.
CREATE FUNCTION hub_project_deleting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_backfill text;
BEGIN
 prior_backfill:=coalesce(current_setting('hub.backfill',true),'off');
 PERFORM set_config('hub.backfill','on',true);
 DELETE FROM "TaskAssignee" a USING "Task" t WHERE a."taskId"=t.id AND t."projectId"=OLD.id AND t."visibilityScope"='project'
 AND a."memberId"<>OLD."ownerId" AND NOT EXISTS(SELECT 1 FROM "ProjectMember" pm WHERE pm."projectId"=OLD.id AND pm."memberId"=a."memberId");
 INSERT INTO "TaskAssignee" (id,"taskId","memberId")
 SELECT md5(t.id||':'||m.id),t.id,m.id FROM "Task" t CROSS JOIN
 (SELECT OLD."ownerId" AS id UNION SELECT "memberId" FROM "ProjectMember" WHERE "projectId"=OLD.id) m
 WHERE t."projectId"=OLD.id AND t."visibilityScope"='project' ON CONFLICT ("taskId","memberId") DO NOTHING;
 UPDATE "Task" SET "visibilityScope"='user' WHERE "projectId"=OLD.id AND "visibilityScope"='project';
 PERFORM set_config('hub.backfill',prior_backfill,true);
 RETURN OLD;
END $$;
CREATE TRIGGER "hub_Project_deleting" BEFORE DELETE ON "Project" FOR EACH ROW EXECUTE FUNCTION hub_project_deleting();

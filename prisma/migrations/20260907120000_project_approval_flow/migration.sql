-- Project proposal approval flow (11-project-proposals.md).
--
-- 1. A proposal can now be REJECTED. This is a terminal decision state, the
--    counterpart to ACTIVE (approved); both are reachable only from PROPOSED
--    and only through an admin decision.
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- 2. Redefine hub_refresh() so an admin decision on a proposal emits a
--    notification, the same way a transaction decision already does. The
--    body below is the existing function from
--    20260906090000_hub_search_notifications with exactly one added ELSIF:
--    the project branch. The project audience receives it, which always
--    includes the proposer (a project's owner is a project member).
CREATE OR REPLACE FUNCTION hub_refresh(source_table text, source_id text) RETURNS void LANGUAGE plpgsql AS $$
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
 ELSIF kind='project' AND status<>previous.status AND status IN ('ACTIVE','REJECTED') THEN PERFORM hub_emit(rid,'project.'||lower(status),updated_at::text,'project',NULL,owner_id);
 END IF;
 END IF;
END $$;

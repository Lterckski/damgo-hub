"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock, MapPin, Video } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import { meetingServiceLabel } from "@/lib/meeting-format";
import type { MeetingMemberOption, SerializedMeetingListItem } from "@/lib/meetings";

interface MeetingsListProps {
  upcoming: SerializedMeetingListItem[];
  past: SerializedMeetingListItem[];
  members: MeetingMemberOption[];
  currentMemberId: string;
}

export function MeetingsList({ upcoming, past, members, currentMemberId }: MeetingsListProps) {
  return (
    <Tabs defaultValue="upcoming">
      <div className="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="upcoming" className="data-active:bg-elevated data-active:text-brand">
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="past" className="data-active:bg-elevated data-active:text-brand">
            Past
          </TabsTrigger>
        </TabsList>
        <MeetingFormDialog members={members} currentMemberId={currentMemberId} />
      </div>

      <TabsContent value="upcoming" className="mt-6">
        <MeetingGrid
          meetings={upcoming}
          showJoinAction
          emptyMessage="No upcoming meetings — schedule one to get started."
        />
      </TabsContent>
      <TabsContent value="past" className="mt-6">
        <MeetingGrid meetings={past} showJoinAction={false} emptyMessage="No past meetings yet." />
      </TabsContent>
    </Tabs>
  );
}

function MeetingGrid({
  meetings,
  showJoinAction,
  emptyMessage,
}: {
  meetings: SerializedMeetingListItem[];
  showJoinAction: boolean;
  emptyMessage: string;
}) {
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CalendarClock className="h-8 w-8 text-copy-faint" />
        <p className="text-sm text-copy-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {meetings.map((meeting) => (
        <Card
          key={meeting.id}
          className="group/meeting h-full overflow-hidden border-none py-0 shadow-sm ring-1 ring-surface-border transition-all hover:shadow-md hover:ring-brand/40"
        >
          <div className="h-1 bg-gradient-to-r from-brand to-collab" />
          <Link href={`/meetings/${meeting.id}`} className="block">
            <CardContent className="p-5">
              <div className="flex items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-copy-primary">{meeting.title}</h3>
              </div>

              <p className="mt-3 text-xs font-medium text-copy-secondary">
                {format(new Date(meeting.scheduledAt), "EEE, MMM d · h:mm a")}
              </p>
              <p className="text-xs font-medium text-copy-secondary">Organized by {meeting.organizerName}</p>

              {meeting.location && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-copy-secondary">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {meeting.location}
                </p>
              )}
              {meeting.meetingUrl && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-copy-secondary">
                  <Video className="h-3.5 w-3.5 shrink-0" /> {meetingServiceLabel(meeting.meetingUrl)}
                </p>
              )}

              {meeting.participants.length > 0 && (
                <div className="mt-3 flex -space-x-2">
                  {meeting.participants.slice(0, 5).map((participant) => (
                    <Avatar key={participant.id} className="h-6 w-6 border-2 border-surface">
                      <AvatarImage src={participant.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {participant.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              )}
            </CardContent>
          </Link>

          {showJoinAction && meeting.meetingUrl && (
            <div className="border-t border-surface-border px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                render={<a href={meeting.meetingUrl} target="_blank" rel="noreferrer" />}
              >
                <Video className="h-3.5 w-3.5" /> Join external meeting
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@entrophy/types';
import type {
  AnnouncementDto,
  CommunityEventDto,
  GiveawayDto,
  PollDto,
  PollResultsDto,
  SuggestionDto,
  TagBodyDto,
  TagDto,
} from '@entrophy/types/community';
import { apiFetch, toQueryString } from './api';

/** Own query-key namespace for the community plugin, kept separate from the shared `queryKeys` in `./queries.ts` (which this app must not edit). */
export const communityQueryKeys = {
  giveaways: (guildId: string, cursor?: string) =>
    ['guilds', guildId, 'community', 'giveaways', cursor ?? null] as const,
  polls: (guildId: string, cursor?: string) =>
    ['guilds', guildId, 'community', 'polls', cursor ?? null] as const,
  pollResults: (guildId: string, pollId: string) =>
    ['guilds', guildId, 'community', 'polls', pollId, 'results'] as const,
  suggestions: (guildId: string, status: string | undefined, cursor?: string) =>
    ['guilds', guildId, 'community', 'suggestions', status ?? 'all', cursor ?? null] as const,
  announcements: (guildId: string, cursor?: string) =>
    ['guilds', guildId, 'community', 'announcements', cursor ?? null] as const,
  events: (guildId: string, cursor?: string) =>
    ['guilds', guildId, 'community', 'events', cursor ?? null] as const,
  tags: (guildId: string, q: string | undefined, cursor?: string) =>
    ['guilds', guildId, 'community', 'tags', q ?? '', cursor ?? null] as const,
};

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------

export function useCommunityGiveaways(guildId: string | undefined, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.giveaways(guildId ?? '', cursor),
    queryFn: () =>
      apiFetch<Paginated<GiveawayDto>>(`/guilds/${guildId}/community/giveaways${toQueryString({ cursor })}`),
    enabled: Boolean(guildId),
  });
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

export function useCommunityPolls(guildId: string | undefined, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.polls(guildId ?? '', cursor),
    queryFn: () =>
      apiFetch<Paginated<PollDto>>(`/guilds/${guildId}/community/polls${toQueryString({ cursor })}`),
    enabled: Boolean(guildId),
  });
}

export function usePollResults(guildId: string | undefined, pollId: string | undefined) {
  return useQuery({
    queryKey: communityQueryKeys.pollResults(guildId ?? '', pollId ?? ''),
    queryFn: () => apiFetch<PollResultsDto>(`/guilds/${guildId}/community/polls/${pollId}/results`),
    enabled: Boolean(guildId && pollId),
  });
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export function useCommunitySuggestions(guildId: string | undefined, status?: string, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.suggestions(guildId ?? '', status, cursor),
    queryFn: () =>
      apiFetch<Paginated<SuggestionDto>>(
        `/guilds/${guildId}/community/suggestions${toQueryString({ status, cursor })}`,
      ),
    enabled: Boolean(guildId),
  });
}

export interface UpdateSuggestionStatusInput {
  suggestionId: string;
  status: SuggestionDto['status'];
  staffNote?: string;
}

export function useUpdateSuggestionStatus(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, status, staffNote }: UpdateSuggestionStatusInput) =>
      apiFetch<SuggestionDto>(`/guilds/${guildId}/community/suggestions/${suggestionId}`, {
        method: 'PATCH',
        body: { status, staffNote },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'community', 'suggestions'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export function useCommunityAnnouncements(guildId: string | undefined, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.announcements(guildId ?? '', cursor),
    queryFn: () =>
      apiFetch<Paginated<AnnouncementDto>>(
        `/guilds/${guildId}/community/announcements${toQueryString({ cursor })}`,
      ),
    enabled: Boolean(guildId),
  });
}

export function useCancelAnnouncement(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      apiFetch<AnnouncementDto>(`/guilds/${guildId}/community/announcements/${announcementId}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'community', 'announcements'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function useCommunityEvents(guildId: string | undefined, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.events(guildId ?? '', cursor),
    queryFn: () =>
      apiFetch<Paginated<CommunityEventDto>>(
        `/guilds/${guildId}/community/events${toQueryString({ cursor })}`,
      ),
    enabled: Boolean(guildId),
  });
}

// ---------------------------------------------------------------------------
// Tags (custom commands / auto-responders, spec CG-02)
// ---------------------------------------------------------------------------

export function useCommunityTags(guildId: string | undefined, q?: string, cursor?: string) {
  return useQuery({
    queryKey: communityQueryKeys.tags(guildId ?? '', q || undefined, cursor),
    queryFn: () =>
      apiFetch<Paginated<TagDto>>(
        `/guilds/${guildId}/community/tags${toQueryString({ q: q || undefined, cursor })}`,
      ),
    enabled: Boolean(guildId),
  });
}

function invalidateTags(queryClient: ReturnType<typeof useQueryClient>, guildId: string) {
  void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'community', 'tags'] });
}

export function useCreateTag(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TagBodyDto) =>
      apiFetch<TagDto>(`/guilds/${guildId}/community/tags`, { method: 'POST', body }),
    onSuccess: () => invalidateTags(queryClient, guildId),
  });
}

export function useUpdateTag(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, body }: { tagId: string; body: TagBodyDto }) =>
      apiFetch<TagDto>(`/guilds/${guildId}/community/tags/${tagId}`, { method: 'PUT', body }),
    onSuccess: () => invalidateTags(queryClient, guildId),
  });
}

export function useDeleteTag(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch<void>(`/guilds/${guildId}/community/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateTags(queryClient, guildId),
  });
}

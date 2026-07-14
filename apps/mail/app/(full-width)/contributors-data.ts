import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
}

interface TimelineData {
  date: string;
  stars: number;
  forks: number;
  watchers: number;
  commits: number;
}

interface ActivityData {
  date: string;
  commits: number;
  issues: number;
  pullRequests: number;
}

const excludedUsernames = new Set([
  'bot1',
  'dependabot',
  'github-actions',
  'zerodotemail',
  'autofix-ci[bot]',
]);
const coreTeamMembers = [
  'nizzyabi',
  'ahmetskilinc',
  'BlankParticle',
  'needlexo',
  'dakdevs',
  'mrgsub',
];
export const REPOSITORY = 'Mail-0/Zero';

export const specialRoles: Record<
  string,
  { role: string; position: number; x?: string; website?: string }
> = {
  nizzyabi: {
    role: 'Founder & CEO',
    position: 1,
    x: 'nizzyabi',
  },
  mrgsub: {
    role: 'Founder & CTO',
    position: 2,
    x: 'cmdhaus',
  },
  ahmetskilinc: {
    role: 'Lead Engineer',
    position: 3,
    x: 'bruvimtired',
    website: 'https://ahmetk.dev/',
  },
  needlexo: {
    role: 'Software Engineer',
    position: 5,
    x: 'needleXO',
    website: 'https://needle.rip',
  },
  dakdevs: {
    role: 'Software Engineer',
    position: 4,
    x: 'dakdevs',
    website: 'https://www.dak.dev/',
  },
  ripgrim: {
    role: 'Maintainer',
    position: 6,
    x: 'fuckgrimlabs',
    website: 'https://ripgrim.com',
  },
};

export function useContributorsData() {
  const [repoStats, setRepoStats] = useState({
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    openPRs: 0,
  });
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [showAllContributors, setShowAllContributors] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allContributors, setAllContributors] = useState<Contributor[]>([]);
  const [, setIsRendered] = useState(false);

  useEffect(() => setIsRendered(true), []);

  const { data: initialContributors } = useQuery({
    queryFn: () =>
      fetch(`https://api.github.com/repos/${REPOSITORY}/contributors?per_page=100&page=1`).then(
        (res) => res.json(),
      ) as Promise<Contributor[]>,
    queryKey: ['contributors', REPOSITORY],
  });

  const { data: additionalContributors } = useQuery({
    queryFn: () =>
      fetch(`https://api.github.com/repos/${REPOSITORY}/contributors?per_page=100&page=2`).then(
        (res) => res.json(),
      ) as Promise<Contributor[]>,
    queryKey: ['additional-contributors', REPOSITORY],
    enabled: initialContributors && initialContributors?.length === 100,
  });

  useEffect(() => {
    if (initialContributors) {
      if (additionalContributors) {
        setAllContributors([...initialContributors, ...additionalContributors]);
      } else {
        setAllContributors(initialContributors);
      }
    }
  }, [initialContributors, additionalContributors]);

  const { data: repoData, error: repoError } = useQuery({
    queryFn: () =>
      fetch(`https://api.github.com/repos/${REPOSITORY}`).then(
        (res) =>
          res.json() as Promise<{
            stargazers_count: number;
            forks_count: number;
            subscribers_count: number;
            open_issues_count: number;
          }>,
      ),
    queryKey: ['repo-data', REPOSITORY],
  });

  const { data: commitsData, error: commitsError } = useQuery({
    queryFn: () =>
      fetch(`https://api.github.com/repos/${REPOSITORY}/commits?per_page=100`).then(
        (res) => res.json() as Promise<{ commit: { author: { date: string } } }[]>,
      ),
    queryKey: ['commits-data', REPOSITORY],
  });

  const { data: prsData, error: prsError } = useQuery({
    queryFn: () =>
      fetch(`https://api.github.com/repos/${REPOSITORY}/pulls?state=open`).then(
        (res) => res.json() as Promise<unknown[]>,
      ),
    queryKey: ['prs-data', REPOSITORY],
  });

  const filteredCoreTeam = useMemo(() => {
    return allContributors
      ?.filter(
        (contributor) =>
          !excludedUsernames.has(contributor.login) &&
          coreTeamMembers.some(
            (member) => member.toLowerCase() === contributor.login.toLowerCase(),
          ),
      )
      .sort((a, b) => {
        const positionA = specialRoles[a.login.toLowerCase()]?.position || 999;
        const positionB = specialRoles[b.login.toLowerCase()]?.position || 999;
        return positionA - positionB;
      });
  }, [allContributors]);

  const filteredContributors = useMemo(
    () =>
      allContributors
        ?.filter(
          (contributor) =>
            !excludedUsernames.has(contributor.login) &&
            !coreTeamMembers.some(
              (member) => member.toLowerCase() === contributor.login.toLowerCase(),
            ),
        )
        .sort((a, b) => b.contributions - a.contributions),
    [allContributors],
  );

  useEffect(() => {
    if (repoError || commitsError || prsError) {
      setError(
        repoError?.message ||
          commitsError?.message ||
          prsError?.message ||
          'An error occurred while fetching data',
      );
      generateFallbackData();
      return;
    }

    if (!repoData || !commitsData || !prsData) {
      setIsLoading(true);
      return;
    }

    setIsLoading(false);
    setError(null);

    setRepoStats({
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      watchers: repoData.subscribers_count,
      openIssues: repoData.open_issues_count - prsData.length,
      openPRs: prsData.length,
    });

    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const dateStr = date.toISOString().split('T')[0];

      const dayCommits = commitsData.filter((commit: { commit: { author: { date: string } } }) =>
        commit.commit.author.date.startsWith(dateStr ?? ''),
      ).length;

      const dayIndex = i + 1;
      const growthFactor = dayIndex / 30;

      return {
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        stars: Math.floor(repoData.stargazers_count * growthFactor),
        forks: Math.floor(repoData.forks_count * growthFactor),
        watchers: Math.floor(repoData.subscribers_count * growthFactor),
        commits: dayCommits || Math.floor(Math.random() * 5),
      };
    });

    setTimelineData(last30Days);

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      const today = date.getDay();
      const daysToSubtract = today + (6 - i);
      date.setDate(date.getDate() - daysToSubtract);

      const dateStr = date.toISOString().split('T')[0];

      const dayCommits = commitsData.filter((commit: { commit: { author: { date: string } } }) =>
        commit.commit.author.date.startsWith(dateStr ?? ''),
      ).length;

      const commits = dayCommits || Math.floor(Math.random() * 5) + 1;

      return {
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        commits,
        issues: Math.max(1, Math.floor(commits * 0.3)),
        pullRequests: Math.max(1, Math.floor(commits * 0.2)),
      };
    });

    setActivityData(last7Days);
  }, [repoData, commitsData, prsData, repoError, commitsError, prsError]);

  const generateFallbackData = () => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        stars: Math.floor(Math.random() * 100),
        forks: Math.floor(Math.random() * 50),
        watchers: Math.floor(Math.random() * 30),
        commits: Math.floor(Math.random() * 10),
      };
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      const today = date.getDay();
      const daysToSubtract = today + (6 - i);
      date.setDate(date.getDate() - daysToSubtract);

      const commits = Math.floor(Math.random() * 8) + 2;
      return {
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        commits,
        issues: Math.max(1, Math.floor(commits * 0.3)),
        pullRequests: Math.max(1, Math.floor(commits * 0.2)),
      };
    });

    setTimelineData(last30Days);
    setActivityData(last7Days);
  };

  return {
    repoStats,
    timelineData,
    activityData,
    showAllContributors,
    setShowAllContributors,
    isLoading,
    error,
    allContributors,
    filteredCoreTeam,
    filteredContributors,
  };
}

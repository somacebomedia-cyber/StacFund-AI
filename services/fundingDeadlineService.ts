import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { User, Application, FundingOpportunityDb, FundingType, FundingDeadlineItem, ApplicationStatus } from '../types';

/**
 * Parses any date format or calculates deadline from dynamic window definitions.
 */
export function parseCutoffDate(dateStr?: string): Date | null {
  if (!dateStr || dateStr === 'Rolling' || dateStr === 'Always Open' || dateStr === 'Unknown') {
    return null;
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Calculates time remaining until target cutoff.
 */
export function getCutoffCountdown(targetDate: Date, now: Date = new Date()) {
  const diffMs = targetDate.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return {
      passed: true,
      urgency: 'passed' as const,
      totalSecondsRemaining: 0,
      hoursRemaining: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  let urgency: 'critical' | 'imminent' | 'upcoming' = 'upcoming';
  if (hoursRemaining <= 48) {
    urgency = 'critical';
  } else if (hoursRemaining <= 168) { // 7 days
    urgency = 'imminent';
  }

  return {
    passed: false,
    urgency,
    totalSecondsRemaining: totalSeconds,
    hoursRemaining,
    days,
    hours,
    minutes,
    seconds
  };
}

/**
 * Builds a merged list of all deadline countdown items for a user, combining:
 * 1. User's active/draft applications with deadlines or associated opportunity cutoffs.
 * 2. Curated & database funding opportunities with upcoming cutoffs.
 */
export function compileUserDeadlines(
  applications: Application[],
  opportunities: FundingOpportunityDb[],
  now: Date = new Date()
): FundingDeadlineItem[] {
  const result: FundingDeadlineItem[] = [];
  const processedOpportunityIds = new Set<string>();

  // 1. Process User Applications (draft / in progress)
  applications.forEach(app => {
    // If the application is already approved or rejected, countdown is not active
    if (app.status === ApplicationStatus.APPROVED || app.status === ApplicationStatus.REJECTED) {
      return;
    }

    // Match opportunity for fallback deadline if application doesn't have an explicit one
    const matchingOpp = opportunities.find(o => o.opportunity_id === app.opportunityId);
    const targetCutoffStr = app.deadline || matchingOpp?.closing_date;

    const cutoffDate = parseCutoffDate(targetCutoffStr);
    if (!cutoffDate) return;

    const countdown = getCutoffCountdown(cutoffDate, now);
    if (countdown.passed) return; // Do not show expired cutoffs in active list

    processedOpportunityIds.add(app.opportunityId);

    result.push({
      id: `app_deadline_${app.id}`,
      opportunityId: app.opportunityId,
      title: app.opportunityTitle,
      provider: app.provider,
      logoUrl: app.logoUrl,
      type: app.type,
      amountText: matchingOpp ? `R${matchingOpp.amount_min.toLocaleString()} - R${matchingOpp.amount_max.toLocaleString()}` : 'Funding Opportunity',
      cutoffDate: cutoffDate.toISOString(),
      isApplication: true,
      applicationId: app.id,
      applicationStatus: app.status,
      requiredDocs: matchingOpp?.required_documents || ['Business Plan', 'CIPC Docs', 'Tax Clearance'],
      eligibilitySummary: matchingOpp?.eligibility_summary || 'Your submitted or drafted funding application.',
      applicationUrl: matchingOpp?.application_url,
      ...countdown
    });
  });

  // 2. Add opportunities that have a real, explicit closing_date (rolling / unknown dates are never given a countdown)
  opportunities.forEach(opp => {
    if (processedOpportunityIds.has(opp.opportunity_id)) return;
    const cutoffDate = parseCutoffDate(opp.closing_date);
    if (!cutoffDate) return;

    const countdown = getCutoffCountdown(cutoffDate, now);
    if (countdown.passed) return;

    result.push({
      id: `opp_deadline_${opp.opportunity_id}`,
      opportunityId: opp.opportunity_id,
      title: opp.programme_name,
      provider: opp.issuer_name,
      logoUrl: opp.logo_url,
      type: opp.funding_type,
      amountText: `R${opp.amount_min.toLocaleString()} - R${opp.amount_max.toLocaleString()}`,
      cutoffDate: cutoffDate.toISOString(),
      isApplication: false,
      requiredDocs: opp.required_documents,
      eligibilitySummary: opp.eligibility_summary,
      applicationUrl: opp.application_url,
      ...countdown
    });
  });

  // Sort by urgency: earliest cutoff first
  return result.sort((a, b) => new Date(a.cutoffDate).getTime() - new Date(b.cutoffDate).getTime());
}

/**
 * Checks all upcoming deadlines and automatically triggers a notification
 * if the user is within 48 hours of an important cutoff date.
 * Ensures deduplication so notifications aren't repeatedly created.
 */
export async function checkAndTrigger48hNotifications(
  user: User | null,
  deadlines: FundingDeadlineItem[]
): Promise<number> {
  if (!user || !user.id) return 0;

  // Filter items strictly within 48 hours and not expired
  const urgentDeadlines = deadlines.filter(d => d.urgency === 'critical' && d.hoursRemaining > 0 && d.hoursRemaining <= 48);
  if (urgentDeadlines.length === 0) return 0;

  let triggeredCount = 0;

  try {
    // Check existing notifications to avoid duplicate triggers
    const notifsRef = collection(db, 'users', user.id, 'notifications');
    const existingSnap = await getDocs(notifsRef);
    const existingNotifs = existingSnap.docs.map(doc => doc.data());

    for (const item of urgentDeadlines) {
      const hoursLeft = Math.max(1, Math.round(item.hoursRemaining));
      const cutoffFormatted = new Date(item.cutoffDate).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Deduplication check: Has a notification for this opportunity been triggered recently?
      const alreadyNotified = existingNotifs.some(n => {
        if (n.opportunityId && n.opportunityId === item.opportunityId) {
          // If notified within last 24 hours, don't spam
          const notifDate = new Date(n.date).getTime();
          const ageHours = (Date.now() - notifDate) / (1000 * 3600);
          return ageHours < 24;
        }
        // Fallback title match
        return n.title && n.title.includes(item.title) && n.type === 'alert';
      });

      if (!alreadyNotified) {
        const notifData = {
          title: `⚡ Cutoff Alert: ${item.title} closes in ${hoursLeft}h!`,
          message: `Application cutoff date is ${cutoffFormatted}. Complete and submit your required compliance documents before the submission portal locks.`,
          date: new Date().toISOString(),
          isRead: false,
          type: 'alert' as const,
          actionPage: item.isApplication ? 'applications' : 'funding',
          opportunityId: item.opportunityId,
          cutoffDate: item.cutoffDate
        };

        await addDoc(notifsRef, notifData);
        triggeredCount++;

        // Dispatch in-window event for instant reactive UI feedback
        window.dispatchEvent(new CustomEvent('stacfund_cutoff_triggered', {
          detail: {
            item,
            hoursLeft
          }
        }));

        // Trigger native notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`⚡ StacFund Cutoff Warning (${hoursLeft}h left)`, {
              body: `${item.title} deadline is approaching on ${cutoffFormatted}. Submit now to secure consideration.`,
              icon: '/icon.png'
            });
          } catch {
            // Notification api may be blocked in some iframe contexts
          }
        }
      }
    }
  } catch (error) {
    console.error('Error triggering 48h deadline notification:', error);
    // Silent fail so it does not block the UI
  }

  return triggeredCount;
}

/**
 * Generates an .ics file download or Google Calendar link for a cutoff.
 */
export function createCalendarEvent(item: FundingDeadlineItem): { googleUrl: string; icsContent: string; fileName: string } {
  const endDate = new Date(item.cutoffDate);
  const startDate = new Date(endDate.getTime() - 2 * 3600 * 1000); // 2 hours before cutoff

  const formatGCalDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  
  const title = encodeURIComponent(`[DEADLINE CUTOFF] ${item.title} - ${item.provider}`);
  const details = encodeURIComponent(
    `Important funding cutoff for ${item.title}.\nIssuer: ${item.provider}\nAmount: ${item.amountText}\nApplication URL: ${item.applicationUrl || 'https://stacfund.co.za'}\n\nPlease submit all documents before this time.`
  );
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatGCalDate(startDate)}/${formatGCalDate(endDate)}&details=${details}&add=1`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StacFund//Funding Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:stacfund-${item.opportunityId}-${endDate.getTime()}@stacfund.co.za`,
    `DTSTAMP:${formatGCalDate(new Date())}`,
    `DTSTART:${formatGCalDate(startDate)}`,
    `DTEND:${formatGCalDate(endDate)}`,
    `SUMMARY:[DEADLINE CUTOFF] ${item.title}`,
    `DESCRIPTION:Funding deadline for ${item.title} by ${item.provider}. Amount: ${item.amountText}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Funding deadline closes in 24 hours!',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Funding deadline closes in 2 hours!',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const icsContent = icsLines.join('\r\n');
  const fileName = `stacfund-${item.opportunityId}-deadline.ics`;

  return { googleUrl, icsContent, fileName };
}

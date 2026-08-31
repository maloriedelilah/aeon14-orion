export interface Lead { email: string; name?: string; groups?: string[]; }
export interface LeadAdapter { name: string; subscribe(lead: Lead): Promise<{ ok: true }>; }

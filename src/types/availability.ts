// TypeScript types for Provider Availability feature

export type DayOfWeek = 
  | 'monday' 
  | 'tuesday' 
  | 'wednesday' 
  | 'thursday' 
  | 'friday' 
  | 'saturday' 
  | 'sunday';

export interface TimeSlot {
  id?: string;
  provider_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM" format (24-hour)
  end_time: string;   // "HH:MM" format (24-hour)
  created_at?: string;
  updated_at?: string;
}

export interface AvailabilitySchedule {
  slots: TimeSlot[];
}

export interface GroupedAvailability {
  [key: string]: TimeSlot[]; // key is DayOfWeek
}

export interface CreateAvailabilityRequest {
  provider_id: string;
  slots: Array<{
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
  }>;
}

export interface UpdateTimeSlotRequest {
  day_of_week?: DayOfWeek;
  start_time?: string;
  end_time?: string;
}

export interface AvailabilityResponse {
  success: boolean;
  data?: AvailabilitySchedule;
  error?: string;
}

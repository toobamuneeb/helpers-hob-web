import { z } from 'zod'

// Job creation schemas
export const createOpenJobSchema = z.object({
  job_title: z.string().min(3).max(60).optional(),
  skill_id: z.string().uuid(),
  service_description: z.string().min(10).max(1000),
  image_url: z.string().url().optional(),
  location_address: z.string().min(5).max(500),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  service_duration: z.string().min(1).max(50),
  service_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_amount: z.number().positive().max(10000),
  currency: z.string().length(3).default('EUR'),
  is_recurring: z.boolean().default(false),
  recurrence_type: z.enum(['daily', 'weekly', 'bi-weekly', 'monthly']).optional(),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pay_through_platform: z.boolean().default(true)
}).refine(
  (data) => {
    // If recurring, must have recurrence_type and recurrence_end_date
    if (data.is_recurring) {
      return data.recurrence_type && data.recurrence_end_date
    }
    return true
  },
  {
    message: 'Recurring jobs must have recurrence_type and recurrence_end_date'
  }
).refine(
  (data) => {
    // Validate minimum duration based on recurrence type
    if (data.is_recurring && data.recurrence_end_date && data.service_date) {
      const startDate = new Date(data.service_date)
      const endDate = new Date(data.recurrence_end_date)
      const diffInDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Minimum duration requirements — at least 2 occurrences per type
      const minDurations = {
        'daily':      2,  // 2 days  → 2 jobs
        'weekly':     7,  // 1 week  → 2 jobs
        'bi-weekly':  14, // 2 weeks → 2 jobs
        'monthly':    30  // 1 month → 2 jobs
      }
      
      const minDuration = data.recurrence_type ? minDurations[data.recurrence_type] : 0
      
      if (diffInDays < minDuration) {
        return false
      }
    }
    return true
  },
  {
    message: 'Recurring jobs must have sufficient duration: Daily (min 2 days / 2 jobs), Weekly (min 7 days / 2 jobs), Bi-weekly (min 14 days / 2 jobs), Monthly (min 30 days / 2 jobs)'
  }
).refine(
  (data) => {
    // Validate max duration for recurring jobs (max 1 year)
    if (data.is_recurring && data.recurrence_end_date && data.service_date) {
      const startDate = new Date(data.service_date)
      const endDate = new Date(data.recurrence_end_date)
      const diffInDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Max 365 days (1 year)
      return diffInDays <= 365 && diffInDays > 0
    }
    return true
  },
  {
    message: 'Recurring jobs cannot span more than 1 year and end date must be after start date'
  }
)

export const createDirectJobSchema = createOpenJobSchema.extend({
  provider_id: z.string().uuid()
})

// Job application schemas
export const applyToJobSchema = z.object({
  job_id: z.string().uuid()
})

export const acceptJobApplicationSchema = z.object({
  job_id: z.string().uuid(),
  provider_id: z.string().uuid()
})

export const completeJobSchema = z.object({
  job_id: z.string().uuid()
})

export const cancelJobSchema = z.object({
  job_id: z.string().uuid(),
  cancellation_reason: z.string().max(500).optional(),
  cancel_series: z.boolean().optional().default(false)
})

// Chat schemas
export const createChatSchema = z.object({
  customer_id: z.string().uuid(),
  service_provider_id: z.string().uuid(),
  job_id: z.string().uuid().optional(),
  job_title: z.string().max(255).optional()
})

export const sendMessageSchema = z.object({
  chat_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
  message_type: z.enum(['text', 'image', 'system']).default('text'),
  action_type: z.enum(['hire_now', 'job_offer', 'accept_offer', 'reject_offer']).optional(),
  action_data: z.record(z.string(), z.any()).optional()
})

// Query schemas
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
})

export const jobFiltersSchema = z.object({
  status_filter: z.enum(['scheduled', 'pending', 'active', 'completed', 'canceled']).optional(),
  skill_filter: z.string().uuid().optional()
}).merge(paginationSchema)

// Validation helper
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ')
      return { success: false, error: errorMessages }
    }
    return { success: false, error: 'Validation failed' }
  }
}
// Translations for the messages the API returns.
//
// Routes answer in English — they run on the server, where there is no session
// locale to render against — and the client shows `res.error` verbatim, so a
// Dutch user was reading English the moment anything failed. This maps each
// known message to a key; `apiRequest` translates on the way through, and
// anything unrecognised passes untouched.
//
// Keyed by the exact English text rather than an error code because that is
// what the routes already send; introducing codes would mean touching every
// route and every call site.

export const SERVER_MESSAGE_KEYS: Record<string, string> = {
  "A cancellation request for this series is already awaiting review": "api.aCancellationRequestForThisSeries",
  "Chat ID required": "api.chatIdRequired",
  "Could not identify payment to fix": "api.couldNotIdentifyPaymentToFix",
  "Customer not found": "api.customerNotFound",
  "Database connection failed": "api.databaseConnectionFailed",
  "Failed to check payment status": "api.failedToCheckPaymentStatus",
  "Failed to check status": "api.failedToCheckStatus",
  "Failed to complete payment": "api.failedToCompletePayment",
  "Failed to complete payment manually": "api.failedToCompletePaymentManually",
  "Failed to create chat": "api.failedToCreateChat",
  "Failed to fetch availability": "api.failedToFetchAvailability",
  "Failed to fetch chats": "api.failedToFetchChats",
  "Failed to fetch earnings": "api.failedToFetchEarnings",
  "Failed to fetch feed": "api.failedToFetchFeed",
  "Failed to fetch payment history": "api.failedToFetchPaymentHistory",
  "Failed to fetch pending offers": "api.failedToFetchPendingOffers",
  "Failed to fetch posts": "api.failedToFetchPosts",
  "Failed to fetch recommended providers": "api.failedToFetchRecommendedProviders",
  "Failed to fetch series": "api.failedToFetchSeries",
  "Failed to save availability": "api.failedToSaveAvailability",
  "Failed to update offer": "api.failedToUpdateOffer",
  "Failed to update payment": "api.failedToUpdatePayment",
  "Failed to update profile": "api.failedToUpdateProfile",
  "HelpersHob Backend API is running": "api.helpershobBackendApiIsRunning",
  "Internal server error": "api.internalServerError",
  "Invalid request data": "api.invalidRequestData",
  "Invalid token": "api.invalidToken",
  "Job ID required": "api.jobIdRequired",
  "Job already skipped": "api.jobAlreadySkipped",
  "Job post not found": "api.jobPostNotFound",
  "Job skipped successfully": "api.jobSkippedSuccessfully",
  "Manual fix failed": "api.manualFixFailed",
  "Missing or invalid authorization header": "api.missingOrInvalidAuthorizationHeader",
  "No payment for this offer": "api.noPaymentForThisOffer",
  "No recent payments found": "api.noRecentPaymentsFound",
  "Not a party to this booking": "api.notAPartyToThisBooking",
  "Not authorized for this offer": "api.notAuthorizedForThisOffer",
  "Not available in production": "api.notAvailableInProduction",
  "Not connected to Mollie yet": "api.notConnectedToMollieYet",
  "Offer ID required": "api.offerIdRequired",
  "Offer not found": "api.offerNotFound",
  "Only customers can create offers": "api.onlyCustomersCanCreateOffers",
  "Payment ID required": "api.paymentIdRequired",
  "Payment manually marked as complete": "api.paymentManuallyMarkedAsComplete",
  "Payment marked as paid (TEST MODE)": "api.paymentMarkedAsPaidTestMode",
  "Payment not found": "api.paymentNotFound",
  "Payment status updated successfully": "api.paymentStatusUpdatedSuccessfully",
  "Please pay \u20ac5 monthly token first": "api.pleasePayMonthlyTokenFirst",
  "Provider not found": "api.providerNotFound",
  "Recurring jobs cannot span more than 1 year and end date must be after start date": "api.recurringJobsCannotSpanMoreThan",
  "Recurring jobs must have recurrence_type and recurrence_end_date": "api.recurringJobsMustHaveRecurrenceType",
  "Slots must be an array": "api.slotsMustBeAnArray",
  "This booking is not part of a recurring series": "api.thisBookingIsNotPartOf",
  "Time must be in HH:MM format (00:00-23:59)": "api.timeMustBeInHhMm",
  "Token not required for one-time jobs": "api.tokenNotRequiredForOneTime",
  "Unauthorized": "api.unauthorized",
  "Unauthorized - invalid token": "api.unauthorizedInvalidToken",
  "Validation failed": "api.validationFailed",
}

/** The translated message, or the original when it is not one we know. */
export function translateServerMessage(
  message: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!message) return message
  const key = SERVER_MESSAGE_KEYS[message]
  return key ? t(key) : message
}

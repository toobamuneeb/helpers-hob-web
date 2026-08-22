import { getBrowserSupabase } from '@/lib/supabase-browser'

/**
 * Uploads to the same Supabase buckets the mobile app uses, with the same
 * `${prefix}.${ext}` path shape and `upsert: true`.
 *
 * The browser hands us a real File, so unlike the mobile app there is no
 * base64 round-trip — the bytes go straight up.
 */
export async function uploadImage(
  file: File,
  bucket: string,
  fileName: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = getBrowserSupabase()

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const filePath = `${fileName}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    contentType: file.type || `image/${ext}`,
    upsert: true,
  })

  if (error) {
    // Same three cases the mobile app translates, so users see one wording.
    if (/not found/i.test(error.message)) {
      return { error: `Storage bucket '${bucket}' not found. Please contact support.` }
    }
    if (/permission|policy/i.test(error.message)) {
      return { error: 'Upload permission denied. Please contact support.' }
    }
    return { error: error.message }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return { url: data.publicUrl }
}

const MAX_BYTES = 5 * 1024 * 1024

/** Rejects the two failures worth catching before a slow upload starts. */
export function validateImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file'
  if (file.size > MAX_BYTES) return 'Image must be under 5 MB'
  return null
}

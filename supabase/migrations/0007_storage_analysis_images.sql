-- Create public bucket for analysis chart images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'analysis-images',
  'analysis-images',
  true,
  5242880,  -- 5 MB per file
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- RLS: users can only insert inside their own folder ({user_id}/*)
create policy "analysis_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'analysis-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS: users can delete their own files
create policy "analysis_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'analysis-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public read (bucket is public, but explicit policy keeps it clear)
create policy "analysis_images_public_read"
  on storage.objects for select
  using (bucket_id = 'analysis-images');

-- Allow authenticated users to upload to creator-uploads bucket under their submissions/ prefix
CREATE POLICY "creators_upload_own_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creator-uploads');

CREATE POLICY "creators_read_own_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'creator-uploads');

CREATE POLICY "service_role_all_creator_uploads" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'creator-uploads');

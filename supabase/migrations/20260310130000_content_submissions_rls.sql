-- Allow authenticated users to read content submissions (admin viewing creator profiles)
CREATE POLICY "authenticated_read_submissions" ON creator_content_submissions
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated users to update submissions (admin review)
CREATE POLICY "authenticated_update_submissions" ON creator_content_submissions
  FOR UPDATE TO authenticated
  USING (true);

-- Allow authenticated users to insert submissions (creator submitting content)
CREATE POLICY "authenticated_insert_submissions" ON creator_content_submissions
  FOR INSERT TO authenticated
  WITH CHECK (true);

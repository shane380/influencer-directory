-- Allow admins and managers to read creator_sample_requests
CREATE POLICY "Admin/manager reads sample requests" ON creator_sample_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
);

-- Allow admins and managers to read creator_content_submissions
CREATE POLICY "Admin/manager reads content submissions" ON creator_content_submissions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
);

-- Allow admins and managers to update creator_sample_requests (approve/reject)
CREATE POLICY "Admin/manager updates sample requests" ON creator_sample_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
);

-- Allow admins and managers to update creator_content_submissions (approve/reject)
CREATE POLICY "Admin/manager updates content submissions" ON creator_content_submissions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
);

UPDATE images SET thumb_url = REPLACE(thumb_url, '/small/', '/lg/') WHERE thumb_url LIKE '%/small/%';

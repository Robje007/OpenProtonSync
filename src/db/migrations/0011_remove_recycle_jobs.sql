DELETE FROM `sync_jobs`
WHERE `status` <> 'SYNCED'
  AND (
    lower(`local_path`) LIKE '%/#recycle/%'
    OR lower(`local_path`) LIKE '%/#recycle'
    OR lower(`local_path`) LIKE '%/$recycle.bin/%'
    OR lower(`local_path`) LIKE '%/$recycle.bin'
    OR lower(`local_path`) LIKE '%/.trash/%'
    OR lower(`local_path`) LIKE '%/.trash'
    OR lower(`local_path`) LIKE '%/.trashes/%'
    OR lower(`local_path`) LIKE '%/.trashes'
  );

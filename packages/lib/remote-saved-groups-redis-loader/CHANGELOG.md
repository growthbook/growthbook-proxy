# Changelog

## **0.2.0** - Nov 24, 2026

- Undoes a load that fails, such as when Redis runs out of memory, and waits before retrying a version that ran out of memory (#151)
- Clears groups deleted before their first load finished (#151)
- The command reads `REMOTE_SAVED_GROUPS_CLUSTER_OPTIONS_JSON` for Redis Cluster options, such as TLS and credentials (#153)

## **0.1.0** - Oct 30, 2026

- Initial release: loads GrowthBook Remote Saved Groups into Redis and reports loads to GrowthBook, as a library (`createLoader`) or a command (`remote-saved-groups-redis-loader`)

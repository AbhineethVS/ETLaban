"""Better ETLab backend: log in to ETLab, fetch pages and turn them into JSON.

Nothing here writes to disk. Each request carries the student's own ETLab
session (sealed in a cookie, see session.py) and data is fetched live.
"""

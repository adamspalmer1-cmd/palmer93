insert into public.categories (id, label, icon, sort_order) values
  ('politics', 'Politics', 'landmark', 1),
  ('crypto', 'Crypto', 'bitcoin', 2),
  ('sports', 'Sports', 'trophy', 3),
  ('economy', 'Economy', 'banknote', 4),
  ('culture', 'Culture', 'drama', 5),
  ('science', 'Science & Tech', 'flask-conical', 6)
on conflict (id) do update set
  label = excluded.label,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

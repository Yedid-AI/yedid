-- Migration 030: Cleanup fake aviezer branches + misclassified babait elyahou
--
-- Migration 029 created 7 branches under aviezer (user_id=3) based on names appearing
-- in aviezer leads. Reality: aviezer doesn't operate via branches — those names are
-- city labels, NOT real aviezer branches. Only `elyahou` is a real aviezer branch.
--
-- Also: babait had a branch called `elyahou` (id ~83) that actually belongs to aviezer.
-- We delete the babait one and keep aviezer's.

-- ============ NULL out leads.branch_id pointing to branches we're about to delete ============
-- (FK has no ON DELETE clause; must clear refs first)
UPDATE leads SET branch_id = NULL
WHERE branch_id IN (
  SELECT b.id FROM branches b
  JOIN users u ON u.id = b.user_id
  WHERE
    -- Fake aviezer city-named branches
    (u.enterprise = 'aviezer' AND b.name IN ('תל אביב','רעננה','ירושלים','חיפה','יבנה','באר שבע'))
    OR
    -- Misclassified babait elyahou
    (u.enterprise = 'babait' AND b.name = 'elyahou')
);

-- ============ DELETE the fake/misclassified branches ============
DELETE FROM branches
WHERE id IN (
  SELECT b.id FROM branches b
  JOIN users u ON u.id = b.user_id
  WHERE
    (u.enterprise = 'aviezer' AND b.name IN ('תל אביב','רעננה','ירושלים','חיפה','יבנה','באר שבע'))
    OR
    (u.enterprise = 'babait' AND b.name = 'elyahou')
);

-- ============ ALTER FK to ON DELETE SET NULL (for future safety) ============
-- So future branch deletions automatically null leads.branch_id
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_branch_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

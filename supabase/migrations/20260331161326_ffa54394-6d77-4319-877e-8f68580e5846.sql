
CREATE OR REPLACE FUNCTION public.save_budget_atomic(p_budget jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_budget_id uuid;
  v_is_new boolean := false;
  v_item jsonb;
  v_item_count integer;
BEGIN
  v_item_count := jsonb_array_length(COALESCE(p_items, '[]'::jsonb));

  -- Check if budget has an id
  IF p_budget->>'id' IS NOT NULL AND p_budget->>'id' != '' THEN
    v_budget_id := (p_budget->>'id')::uuid;
    
    -- PROTECTION: if updating an existing budget with 0 items, do NOT touch totals
    IF v_item_count = 0 THEN
      RAISE EXCEPTION 'Cannot save budget with 0 items — aborting to protect existing data';
    END IF;
    
    -- Update existing budget
    UPDATE budgets SET
      project_name = COALESCE(p_budget->>'project_name', project_name),
      client_name = COALESCE(p_budget->>'client_name', client_name),
      client_id = (p_budget->>'client_id')::uuid,
      status = COALESCE(p_budget->>'status', status),
      markup_percent = COALESCE((p_budget->>'markup_percent')::numeric, markup_percent),
      tax_percent = COALESCE((p_budget->>'tax_percent')::numeric, tax_percent),
      bv_percent = COALESCE((p_budget->>'bv_percent')::numeric, bv_percent),
      commission_percent = COALESCE((p_budget->>'commission_percent')::numeric, commission_percent),
      discount = COALESCE((p_budget->>'discount')::numeric, discount),
      addition = COALESCE((p_budget->>'addition')::numeric, addition),
      subtotal_1 = (p_budget->>'subtotal_1')::numeric,
      subtotal_2 = (p_budget->>'subtotal_2')::numeric,
      tax_value = (p_budget->>'tax_value')::numeric,
      bv_value = (p_budget->>'bv_value')::numeric,
      commission_value = (p_budget->>'commission_value')::numeric,
      total_value = (p_budget->>'total_value')::numeric,
      margin_value = (p_budget->>'margin_value')::numeric,
      margin_percent = (p_budget->>'margin_percent')::numeric,
      not_included = COALESCE(p_budget->'not_included', '[]'::jsonb),
      deal_id = (p_budget->>'deal_id')::uuid,
      proposal_name = p_budget->>'proposal_name',
      internal_notes = p_budget->>'internal_notes',
      version_notes = p_budget->>'version_notes',
      capture_days = COALESCE((p_budget->>'capture_days')::integer, 0),
      project_count = COALESCE((p_budget->>'project_count')::integer, 1),
      updated_at = now()
    WHERE id = v_budget_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Budget not found: %', v_budget_id;
    END IF;
  ELSE
    v_is_new := true;
    v_budget_id := gen_random_uuid();
    
    INSERT INTO budgets (
      id, project_name, client_name, client_id, status,
      markup_percent, tax_percent, bv_percent, commission_percent,
      discount, addition, subtotal_1, subtotal_2,
      tax_value, bv_value, commission_value, total_value,
      margin_value, margin_percent, not_included, deal_id,
      proposal_name, internal_notes, version_notes,
      budget_number, version, is_latest_version, parent_budget_id,
      created_by, capture_days, project_count
    ) VALUES (
      v_budget_id,
      p_budget->>'project_name',
      p_budget->>'client_name',
      (p_budget->>'client_id')::uuid,
      COALESCE(p_budget->>'status', 'draft'),
      COALESCE((p_budget->>'markup_percent')::numeric, 35),
      COALESCE((p_budget->>'tax_percent')::numeric, 9.5),
      COALESCE((p_budget->>'bv_percent')::numeric, 0),
      COALESCE((p_budget->>'commission_percent')::numeric, 4),
      COALESCE((p_budget->>'discount')::numeric, 0),
      COALESCE((p_budget->>'addition')::numeric, 0),
      (p_budget->>'subtotal_1')::numeric,
      (p_budget->>'subtotal_2')::numeric,
      (p_budget->>'tax_value')::numeric,
      (p_budget->>'bv_value')::numeric,
      (p_budget->>'commission_value')::numeric,
      (p_budget->>'total_value')::numeric,
      (p_budget->>'margin_value')::numeric,
      (p_budget->>'margin_percent')::numeric,
      COALESCE(p_budget->'not_included', '[]'::jsonb),
      (p_budget->>'deal_id')::uuid,
      p_budget->>'proposal_name',
      p_budget->>'internal_notes',
      p_budget->>'version_notes',
      COALESCE((p_budget->>'budget_number')::integer, nextval('budget_number_seq')::integer),
      COALESCE((p_budget->>'version')::integer, 1),
      COALESCE((p_budget->>'is_latest_version')::boolean, true),
      (p_budget->>'parent_budget_id')::uuid,
      p_budget->>'created_by',
      COALESCE((p_budget->>'capture_days')::integer, 0),
      COALESCE((p_budget->>'project_count')::integer, 1)
    );
  END IF;

  -- Delete existing items (inside same transaction)
  DELETE FROM budget_items WHERE budget_id = v_budget_id;

  -- Insert new items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO budget_items (
      budget_id, category, item_name, group_name,
      client_days, client_people, client_unit_price, client_price,
      has_supplier_cost, supplier_days, supplier_people, supplier_unit_price, supplier_cost,
      margin_value, margin_percent, order_index, is_deliverable, quantity, unit_type
    ) VALUES (
      v_budget_id,
      COALESCE(v_item->>'category', ''),
      COALESCE(v_item->>'item_name', ''),
      v_item->>'group_name',
      COALESCE((v_item->>'client_days')::numeric, 1),
      COALESCE((v_item->>'client_people')::numeric, 1),
      COALESCE((v_item->>'client_unit_price')::numeric, 0),
      COALESCE((v_item->>'client_price')::numeric, 0),
      COALESCE((v_item->>'has_supplier_cost')::boolean, false),
      COALESCE((v_item->>'supplier_days')::numeric, 0),
      COALESCE((v_item->>'supplier_people')::numeric, 0),
      COALESCE((v_item->>'supplier_unit_price')::numeric, 0),
      COALESCE((v_item->>'supplier_cost')::numeric, 0),
      COALESCE((v_item->>'margin_value')::numeric, 0),
      COALESCE((v_item->>'margin_percent')::numeric, 0),
      COALESCE((v_item->>'order_index')::integer, 0),
      COALESCE((v_item->>'is_deliverable')::boolean, false),
      COALESCE((v_item->>'quantity')::numeric, 1),
      v_item->>'unit_type'
    );
  END LOOP;

  RETURN v_budget_id;
END;
$function$;

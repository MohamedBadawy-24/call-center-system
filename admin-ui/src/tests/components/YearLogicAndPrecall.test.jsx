import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { normalizeOutboundPrecall } from '../../utils/outboundPrecallConfig';
import ConditionBuilder from '../../components/ConditionBuilder';
import { UIContext } from '../../context/UIContext';

describe('Year Input: Pre-Call yearRange and Logic Builder Operators', () => {
  it('Bug 1: normalizeOutboundPrecall preserves yearRange on year fields and removes it from non-year fields', () => {
    const rawPrecall = {
      version: 2,
      fields: [
        {
          id: 'birth_year',
          label: 'Birth Year',
          type: 'year',
          required: true,
          yearRange: { from: 1950, to: 2010 }
        },
        {
          id: 'text_field',
          label: 'Some text',
          type: 'text',
          yearRange: { from: 1950, to: 2010 } // Should be stripped
        }
      ]
    };

    const normalized = normalizeOutboundPrecall(rawPrecall);
    const birthYearField = normalized.fields.find(f => f.id === 'birth_year');
    const textField = normalized.fields.find(f => f.id === 'text_field');

    expect(birthYearField).toBeDefined();
    expect(birthYearField.yearRange).toEqual({ from: 1950, to: 2010 });

    expect(textField).toBeDefined();
    expect(textField.yearRange).toBeUndefined();
  });

  it('Bug 2: ConditionBuilder unlocks numeric operators and input for fields with type="year" or type="number"', () => {
    const availableFields = [
      { id: 'grad_year', label: 'Graduation Year', type: 'year' },
      { id: 'fav_color', label: 'Favorite Color', type: 'text' }
    ];

    let currentCondition = {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'rule',
          fieldId: 'grad_year',
          operator: 'gt',
          value: '2020'
        }
      ]
    };

    const handleChange = vi.fn(c => { currentCondition = c; });

    render(
      <UIContext.Provider value={{ t: key => key }}>
        <ConditionBuilder
          condition={currentCondition}
          onChange={handleChange}
          availableFields={availableFields}
        />
      </UIContext.Provider>
    );

    // Operator select should contain numeric options
    const allComboboxes = screen.getAllByRole('combobox');
    const opSelect = allComboboxes.find(sel => sel.value === 'gt');
    expect(opSelect).toBeDefined();
    
    // Check that numeric operators are available in the options
    const options = Array.from(opSelect.querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('gt');
    expect(options).toContain('lt');
    expect(options).toContain('gte');
    expect(options).toContain('lte');

    // Number input should be rendered for value
    const numInput = screen.getByPlaceholderText('0');
    expect(numInput).toBeInTheDocument();
    expect(numInput).toHaveAttribute('type', 'number');

    fireEvent.change(numInput, { target: { value: '2022' } });
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      conditions: [
        expect.objectContaining({
          fieldId: 'grad_year',
          operator: 'gt',
          value: '2022'
        })
      ]
    }));
  });
});

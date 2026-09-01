import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PrecallTab from '../../pages/SurveyBuilder/tabs/PrecallTab';
import { SurveyBuilderContext } from '../../pages/SurveyBuilder/SurveyBuilderContext';
import { UIContext } from '../../context/UIContext';
import { translations } from '../../utils/translations';
import {
  nextSequentialPrecallId,
  newFieldTemplate,
  buildInitialAnswers,
  parseAgeYearsFromAnswers,
  normalizeOutboundPrecall,
  isFieldSatisfied,
  DEFAULT_OUTBOUND_V2,
  SYSTEM_TAG_OPTIONS
} from '../../utils/outboundPrecallConfig';

describe('PrecallTab Features & Outbound Precall Config Tests', () => {
  it('Task 1: nextSequentialPrecallId finds highest number and increments, preserving custom sequences', () => {
    expect(nextSequentialPrecallId([])).toBe('pre_1');
    expect(nextSequentialPrecallId([{ id: 'researcher_name' }, { id: 'phone' }])).toBe('pre_1');
    expect(nextSequentialPrecallId([{ id: 'pre_1' }, { id: 'pre_2' }])).toBe('pre_3');
    expect(nextSequentialPrecallId([{ id: 'pre_1' }, { id: 'pre_10' }, { id: 'pre_5' }])).toBe('pre_11');
    expect(nextSequentialPrecallId([{ id: '101' }])).toBe('102');
    expect(nextSequentialPrecallId([{ id: '1' }, { id: '2' }])).toBe('3');
    expect(nextSequentialPrecallId([{ id: 'q5' }, { id: 'q6' }])).toBe('q7');
  });

  it('Task 1: newFieldTemplate generates sequential ID instead of random hash', () => {
    const template1 = newFieldTemplate([]);
    expect(template1.id).toBe('pre_1');
    expect(template1.systemTag).toBe('');

    const template2 = newFieldTemplate([{ id: 'pre_1' }]);
    expect(template2.id).toBe('pre_2');
  });

  it('Task 3: buildInitialAnswers does NOT auto-select segment choices', () => {
    const fields = [
      {
        id: 'gender',
        type: 'segment',
        systemTag: 'Gender',
        options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]
      },
      {
        id: 'is_egyptian',
        type: 'segment',
        systemTag: 'Nationality',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
      },
      {
        id: 'custom_text',
        type: 'text'
      }
    ];

    const answers = buildInitialAnswers(fields, 'Alice Agent', 'AGENT-01');
    expect(answers.gender).toBe('');
    expect(answers.is_egyptian).toBe('');
    expect(answers.custom_text).toBe('');
  });

  it('Task 5 & 6: buildInitialAnswers auto-fills agent identity and governorate by systemTag', () => {
    const fields = [
      { id: 'custom_agent_field', type: 'text', systemTag: 'Researcher Name' },
      { id: 'custom_code_field', type: 'text', systemTag: 'Researcher Code' },
      { id: 'gov_field', type: 'text', systemTag: 'Governorate' },
      { id: 'regular_field', type: 'text', systemTag: '' }
    ];

    const answers = buildInitialAnswers(fields, 'Dr. Smith', 'RC-999', { governorate: 'Alexandria' });
    expect(answers.custom_agent_field).toBe('Dr. Smith');
    expect(answers.custom_code_field).toBe('RC-999');
    expect(answers.gov_field).toBe('Alexandria');
    expect(answers.regular_field).toBe('');
  });

  it('Task 6: parseAgeYearsFromAnswers prioritizes field with systemTag === Age', () => {
    const fields = [
      { id: 'custom_age_question', type: 'number', systemTag: 'Age' },
      { id: 'age_years', type: 'number', systemTag: '' }
    ];

    const answers = {
      custom_age_question: '42',
      age_years: '20'
    };

    const parsedAge = parseAgeYearsFromAnswers(answers, fields);
    expect(parsedAge).toBe(42);
  });

  it('Task 2 & 4 & 5: PrecallTab renders Clone button, Help tooltip, and System Tag select', () => {
    const mockUpdateState = vi.fn();
    const surveyState = {
      customizeOutbound: true,
      outboundConfig: normalizeOutboundPrecall({
        version: 2,
        meta: { title: 'Test Checklist' },
        sectionOrder: ['agent', 'call', 'phone'],
        fields: [
          { id: 'pre_1', label: 'First Question', type: 'text', section: 'agent', required: true, systemTag: 'Age' }
        ]
      })
    };

    render(
      <UIContext.Provider value={{ t: (k) => translations.en[k] || k }}>
        <SurveyBuilderContext.Provider value={{ isAdmin: true, surveyState, updateState: mockUpdateState }}>
          <PrecallTab />
        </SurveyBuilderContext.Provider>
      </UIContext.Provider>
    );

    // Verify Field ID label has stable tooltip
    expect(screen.getAllByText('Field ID (stable)')[0]).toBeInTheDocument();
    expect(screen.getAllByTitle(/This is the column name for database and SPSS exports/i)[0]).toBeInTheDocument();

    // Verify System Role / Tag select
    expect(screen.getAllByText('System Role / Tag')[0]).toBeInTheDocument();

    // Verify Clone button exists
    const cloneBtns = screen.getAllByTitle('Clone Field');
    expect(cloneBtns[0]).toBeInTheDocument();

    // Click Clone button
    fireEvent.click(cloneBtns[0]);
    expect(mockUpdateState).toHaveBeenCalled();
  });

  it('Task 3: SYSTEM_TAG_OPTIONS contains merged Researcher Code / Account ID', () => {
    const values = SYSTEM_TAG_OPTIONS.map((o) => o.value);
    expect(values).toContain('Researcher Code');
    expect(values).not.toContain('Account ID');
  });

  it('Task 5: isFieldSatisfied enforces minValue and maxValue for number fields', () => {
    const field = {
      id: 'age',
      type: 'number',
      required: true,
      minValue: 18,
      maxValue: 65
    };

    expect(isFieldSatisfied(field, '17')).toBe(false);
    expect(isFieldSatisfied(field, '18')).toBe(true);
    expect(isFieldSatisfied(field, '40')).toBe(true);
    expect(isFieldSatisfied(field, '65')).toBe(true);
    expect(isFieldSatisfied(field, '66')).toBe(false);
  });
});



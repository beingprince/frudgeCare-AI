import { supabase } from './supabase';
import { UserRole } from '@/types';

export const logEvent = async (
  eventName: string,
  caseId: string,
  patientId: string,
  actorRole: UserRole,
  actorUserId?: string,
  metadata: Record<string, any> = {},
  appointmentId?: string
) => {
  try {
    const { error } = await supabase
      .from('events')
      .insert({
        event_name: eventName,
        case_id: caseId,
        patient_id: patientId,
        actor_role: actorRole,
        actor_user_id: actorUserId,
        appointment_id: appointmentId,
        metadata: metadata,
        timestamp: new Date().toISOString(),
      });

    if (error) throw error;
  } catch (err) {
    console.error('Failed to log event:', err);
  }
};

export const logAudit = async (
  tableName: string,
  recordId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
  changedByUserId: string,
  changedByRole: UserRole,
  reason: string
) => {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert({
        table_name: tableName,
        record_id: recordId,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        changed_by_user_id: changedByUserId,
        changed_by_role: changedByRole,
        reason: reason,
        changed_at: new Date().toISOString(),
      });

    if (error) throw error;
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
};

"use server";

import { revalidatePath } from "next/cache";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { WebhookConfig } from "@/lib/core/types";

export interface SaveWebhooksResult {
  success: boolean;
  message: string;
  webhookSecret?: string;
}

export interface RetryDeliveryResult {
  success: boolean;
  message: string;
}

export async function saveWebhooksAction(
  projectId: string,
  database: string,
  collection: string,
  webhooks: WebhookConfig[],
): Promise<SaveWebhooksResult> {
  try {
    const session = await requireDashboardSession();
    const project = await getSelectedDashboardProject(session);
    if (!project || project.id !== projectId || project.database !== database) {
      throw new Error("Unauthorized");
    }

    const client = createProjectCoreClient(project.database);
    const result = await client.setWebhooks({ database, collection, webhooks });

    revalidatePath("/dashboard/webhooks");
    return {
      success: true,
      message: webhooks.length > 0 
        ? "Webhook targets updated successfully." 
        : "All webhook targets removed.",
      webhookSecret: result.webhook_secret,
    };
  } catch (error) {
    console.error("Failed to save webhooks.", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to save webhooks",
    };
  }
}

export async function retryDeliveryAction(
  projectId: string,
  database: string,
  sequence: string | number,
): Promise<RetryDeliveryResult> {
  try {
    const session = await requireDashboardSession();
    const project = await getSelectedDashboardProject(session);
    if (!project || project.id !== projectId || project.database !== database) {
      throw new Error("Unauthorized");
    }

    const client = createProjectCoreClient(project.database);
    await client.retryWebhookDelivery({ database, sequence });

    revalidatePath("/dashboard/webhooks");
    return {
      success: true,
      message: `Delivery ${sequence} queued for retry.`,
    };
  } catch (error) {
    console.error("Failed to retry webhook delivery.", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to retry delivery",
    };
  }
}

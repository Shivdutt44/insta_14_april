import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigation, Form } from "react-router";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  ButtonGroup,
} from "@shopify/polaris";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER - Check current subscription status
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  try {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly", "Plus Monthly", "Plus Yearly"],
      isTest: true,
    });
    return {
      subscription: billingCheck.hasActivePayment ? billingCheck.appSubscriptions[0] : null,
      apiKey: process.env.SHOPIFY_API_KEY,
    };
  } catch (e) {
    return { subscription: null, apiKey: process.env.SHOPIFY_API_KEY };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION - Create subscription via GraphQL directly (most reliable method)
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const planName = formData.get("planName");

  // Plan Details (matches shopify.server.js)
  const PLAN_DATA = {
    "Pro Monthly":  { amount: 8,   interval: "EVERY_30_DAYS", trial: 7 },
    "Pro Yearly":   { amount: 72,  interval: "ANNUAL",        trial: 7 },
    "Plus Monthly": { amount: 20,  interval: "EVERY_30_DAYS", trial: 7 },
    "Plus Yearly":  { amount: 180, interval: "ANNUAL",        trial: 7 },
  };

  if (planName === "Starter") {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly", "Plus Monthly", "Plus Yearly"],
      isTest: true,
    });
    if (billingCheck.hasActivePayment) {
      await billing.cancel({
        subscriptionId: billingCheck.appSubscriptions[0].id,
        isTest: true,
        prorate: true,
      });
    }
    return { success: true };
  }

  const plan = PLAN_DATA[planName];
  if (!plan) return { error: "Plan not found" };

  // Determine API Key carefully
  const apiKey = process.env.SHOPIFY_API_KEY || "27bee79bfa6071d88605e515871d4a7d";
  const returnUrl = `https://${session.shop}/admin/apps/${apiKey}/app/plans`;

  const response = await admin.graphql(
    `mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      variables: {
        name: planName,
        test: true,
        returnUrl: returnUrl,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.amount, currencyCode: "USD" },
                interval: plan.interval,
              },
            },
          },
        ],
      },
    }
  );

  const responseJson = await response.json();
  const data = responseJson.data?.appSubscriptionCreate;

  if (data?.userErrors?.length > 0) {
    return { error: data.userErrors[0].message };
  }

  return { confirmationUrl: data.confirmationUrl };
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Plans() {
  const { subscription } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const [isYearly, setIsYearly] = useState(false);

  const currentPlanName = subscription?.name || "Starter";

  // Redirect to top frame when confirmation URL is received
  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      // Use window.parent.location.href or window.open with _top to escape iframe
      window.top.location.href = fetcher.data.confirmationUrl;
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data?.success) {
      shopify.toast.show("Plan updated successfully");
    }
  }, [fetcher.data, shopify]);

  const plans = [
    {
      name: "Starter", badge: "STARTER", tone: "new",
      description: "Perfect for showcasing your Instagram content on your store.",
      priceMonthly: 0, priceYearly: 0, features: "No limits",
      isCurrent: currentPlanName === "Starter",
    },
    {
      name: "Pro", badge: "PRO", tone: "info",
      description: "For brands ready to convert Instagram feed views into orders.",
      priceMonthly: 8, priceYearly: 6, features: "7-day free trial • cancel anytime",
      isCurrent: currentPlanName.includes("Pro"),
      monthlyName: "Pro Monthly", yearlyName: "Pro Yearly",
    },
    {
      name: "Plus", badge: "PLUS", tone: "success",
      description: "For brands that need automation, UGC display, and reporting.",
      priceMonthly: 20, priceYearly: 15, features: "7-day free trial • cancel anytime",
      isCurrent: currentPlanName.includes("Plus"),
      monthlyName: "Plus Monthly", yearlyName: "Plus Yearly",
    },
  ];

  const handlePlan = (plan) => {
    if (plan.isCurrent) return;
    const name = plan.name === "Starter" ? "Starter" : (isYearly ? plan.yearlyName : plan.monthlyName);
    const fd = new FormData();
    fd.append("planName", name);
    fetcher.submit(fd, { method: "POST" });
  };

  const isSubmitting = fetcher.state !== "idle" || navigation.state !== "idle";

  return (
    <Page title="Plans & Pricing">
      <BlockStack gap="800">
        <InlineStack align="end">
          <ButtonGroup variant="segmented">
            <Button pressed={!isYearly} onClick={() => setIsYearly(false)}>Monthly</Button>
            <Button pressed={isYearly} onClick={() => setIsYearly(true)}>Yearly (Save 25%)</Button>
          </ButtonGroup>
        </InlineStack>

        <Layout>
          {plans.map((p) => (
            <Layout.Section variant="oneThird" key={p.name}>
              <Card background={p.isCurrent ? "bg-surface-secondary" : "bg-surface"}>
                <BlockStack gap="500">
                  <Badge tone={p.tone} size="large">{p.badge}</Badge>
                  <div style={{ minHeight: "48px" }}><Text as="p" tone="subdued">{p.description}</Text></div>
                  <InlineStack align="start" blockAlign="end" gap="100">
                    {p.priceMonthly === 0 ? <Text as="h2" variant="heading3xl">Free</Text> : (
                      <>
                        <Text as="span" variant="bodyLg">USD</Text>
                        <Text as="h2" variant="heading3xl">${isYearly ? p.priceYearly : p.priceMonthly}</Text>
                        <Text as="span" variant="bodyMd" tone="subdued">/month</Text>
                      </>
                    )}
                  </InlineStack>
                  <div style={{ minHeight: "24px" }}><Text as="p" variant="bodySm" tone="subdued">{p.features}</Text></div>
                  <Button
                    size="large"
                    variant={p.isCurrent ? "secondary" : "primary"}
                    disabled={p.isCurrent || isSubmitting}
                    loading={isSubmitting && fetcher.formData?.get("planName")?.includes(p.name)}
                    onClick={() => handlePlan(p)}
                    fullWidth
                  >
                    {p.isCurrent ? "Your current plan" : "Select plan"}
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}

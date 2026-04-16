import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
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

export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  
  try {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly", "Plus Monthly", "Plus Yearly"],
      isTest: true,
    });
    
    return { subscription: billingCheck.hasActivePayment ? billingCheck.appSubscriptions[0] : null };
  } catch (e) {
    return { subscription: null };
  }
};

export const action = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planName = formData.get("planName");

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
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return await billing.request({
    plan: planName,
    isTest: true,
    returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/plans`,
  });
};

export default function Plans() {
  const { subscription } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();
  const [isYearly, setIsYearly] = useState(false);

  useEffect(() => {
    if (fetcher.data && fetcher.data.success) {
      shopify.toast.show("Successfully switched to the Starter plan");
      revalidator.revalidate();
    }
  }, [fetcher.data, shopify, revalidator]);

  const currentPlanName = subscription?.name || "Starter";

  const plans = [
    {
      name: "Starter",
      badge: "STARTER",
      tone: "new",
      description: "Perfect for showcasing your Instagram content on your store.",
      priceMonthly: 0,
      priceYearly: 0,
      features: "No limits",
      buttonText: currentPlanName === "Starter" ? "Your current plan" : "Select plan",
      isCurrent: currentPlanName === "Starter",
    },
    {
      name: "Pro",
      badge: "PRO",
      tone: "info",
      description: "For brands ready to convert Instagram feed views into orders.",
      priceMonthly: 8,
      priceYearly: 6, // 25% off $8
      features: "7-day free trial • cancel anytime",
      buttonText: currentPlanName.includes("Pro") ? "Your current plan" : "Select plan",
      isCurrent: currentPlanName.includes("Pro"),
      actualPlanNameMonthly: "Pro Monthly",
      actualPlanNameYearly: "Pro Yearly",
    },
    {
      name: "Plus",
      badge: "PLUS",
      tone: "success",
      description: "For brands that need automation, UGC display, and reporting.",
      priceMonthly: 20,
      priceYearly: 15, // 25% off $20
      features: "7-day free trial • cancel anytime",
      buttonText: currentPlanName.includes("Plus") ? "Your current plan" : "Select plan",
      isCurrent: currentPlanName.includes("Plus"),
      actualPlanNameMonthly: "Plus Monthly",
      actualPlanNameYearly: "Plus Yearly",
    },
  ];

  const handleSelectPlan = (plan) => {
    if (plan.isCurrent) return;
    
    const selectedPlanName = plan.name === "Starter" ? "Starter" : (isYearly ? plan.actualPlanNameYearly : plan.actualPlanNameMonthly);
    
    const formData = new FormData();
    formData.append("planName", selectedPlanName);
    fetcher.submit(formData, { method: "post" });
  };

  const isSelectingThisPlan = (plan) => {
    if (fetcher.state === "idle" || !fetcher.formData) return false;
    const submittedPlanName = fetcher.formData.get("planName");
    if (plan.name === "Starter" && submittedPlanName === "Starter") return true;
    if (plan.actualPlanNameMonthly === submittedPlanName || plan.actualPlanNameYearly === submittedPlanName) return true;
    return false;
  };

  return (
    <Page title="Plans & Pricing">
      <BlockStack gap="800">
        <InlineStack align="end">
          <ButtonGroup variant="segmented">
            <Button
              pressed={!isYearly}
              onClick={() => setIsYearly(false)}
            >
              Monthly
            </Button>
            <Button
              pressed={isYearly}
              onClick={() => setIsYearly(true)}
            >
              Yearly (Save 25%)
            </Button>
          </ButtonGroup>
        </InlineStack>

        <Layout>
          {plans.map((plan) => (
            <Layout.Section variant="oneThird" key={plan.name}>
              <Card background={plan.isCurrent ? "bg-surface-secondary" : "bg-surface"}>
                <BlockStack gap="500">
                  <InlineStack align="space-between" blockAlign="center">
                    <Badge tone={plan.tone} size="large">
                      {plan.badge}
                    </Badge>
                  </InlineStack>
                  
                  <div style={{ minHeight: "48px" }}>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {plan.description}
                    </Text>
                  </div>

                  <InlineStack align="start" blockAlign="end" gap="100">
                    {plan.priceMonthly === 0 ? (
                      <Text as="h2" variant="heading3xl">Free</Text>
                    ) : (
                      <>
                        <Text as="span" variant="bodyLg">USD</Text>
                        <Text as="h2" variant="heading3xl">${isYearly ? plan.priceYearly : plan.priceMonthly}</Text>
                        <Text as="span" variant="bodyMd" tone="subdued">/month</Text>
                      </>
                    )}
                  </InlineStack>

                  <div style={{ minHeight: "24px" }}>
                    <Text as="p" variant="bodySm" tone="subdued" fontWeight="medium">
                      {plan.features}
                    </Text>
                  </div>

                  <Button
                    size="large"
                    variant={plan.isCurrent ? "secondary" : "primary"}
                    disabled={plan.isCurrent || (fetcher.state !== "idle" && !isSelectingThisPlan(plan))}
                    loading={isSelectingThisPlan(plan)}
                    onClick={() => handleSelectPlan(plan)}
                    fullWidth
                  >
                    {plan.buttonText}
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

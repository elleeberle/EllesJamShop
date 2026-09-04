import { Store } from "@tanstack/store";
import { applyQtyChange } from "./order.js";

export function getInitialOrderState() {
  return {
    qty: {},
    name: "",
    phone: "",
    fulfillment: "pickup",
    address: "",
    zip: "",
    notes: "",
    step: "form",
    paymentMethod: "",
  };
}

export const initialOrderState = getInitialOrderState();

export const orderStore = new Store(getInitialOrderState());

export function resetOrderStore() {
  orderStore.setState(() => getInitialOrderState());
}

export function patchOrder(partial) {
  orderStore.setState((prev) => ({ ...prev, ...partial }));
}

export function changeOrderQty(flavorId, productId, delta) {
  orderStore.setState((prev) => ({
    ...prev,
    qty: applyQtyChange(prev.qty, flavorId, productId, delta),
  }));
}

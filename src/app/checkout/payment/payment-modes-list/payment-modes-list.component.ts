
import { tap } from 'rxjs/operators';
import { getAuthStatus } from './../../../auth/reducers/selectors';
import { CheckoutActions } from './../../actions/checkout.actions';
import { AppState } from './../../../interfaces';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { PaymentMode } from './../../../core/models/payment_mode';
import { PaymentService } from './../services/payment.service';
import { CheckoutService } from './../../../core/services/checkout.service';
import { Component, OnInit, Input } from '@angular/core';
import { Address } from '../../../core/models/address';
import { environment } from '../../../../environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-payment-modes-list',
  templateUrl: './payment-modes-list.component.html',
  styleUrls: ['./payment-modes-list.component.scss']
})
export class PaymentModesListComponent implements OnInit {

  @Input() paymentAmount: number;
  @Input() orderNumber: number;
  @Input() address: Address;
  isShippeble: boolean;
  showDummyCardInfo = environment.config.showDummyCardInfo;

  paymentModes: PaymentMode[];
  selectedMode: PaymentMode = new PaymentMode;
  isAuthenticated: boolean;
  showOrderSuccess = false;
  freeShippingAmount = environment.config.freeShippingAmount;
  currency = environment.config.currency_symbol;
  payubiz = environment.config.PaymentMethodPayubiz;
  cashOnDelivery= environment.config.PaymentMethodCod;

  constructor(private checkoutService: CheckoutService,
    private paymentService: PaymentService,
    private router: Router,
    private store: Store<AppState>,
    private checkoutActions: CheckoutActions,
    private toastyService: ToastrService) {
    this.store.select(getAuthStatus).subscribe((auth) => {
      this.isAuthenticated = auth;
    });
  }

  ngOnInit() {
    this.fetchAllPayments();
  }

  selectedPaymentMode(mode) {
    this.selectedMode = mode;
  }

  private fetchAllPayments() {
    this.checkoutService.availablePaymentMethods()
      .subscribe((payment) => {
        this.paymentModes = payment.payment_methods;
        this.selectedMode = this.paymentService.getDefaultSelectedMode(this.paymentModes);
      });

  }

  makePaymentCod() {
    const paymentModeId = this.selectedMode.id;
    const shipping_pincode = (this.address.zipcode)
    this.checkoutService.shipmentAvailability(+shipping_pincode)
      .subscribe((res: any) => {
        this.isShippeble = res.available
        if (this.isShippeble && this.paymentAmount >= this.freeShippingAmount) {
          this.checkoutService.createNewPayment(paymentModeId, this.paymentAmount).pipe(
            tap(() => {
              this.store.dispatch(this.checkoutActions.orderCompleteSuccess());
              this.redirectToNewPage();
              this.checkoutService.createEmptyOrder()
                .subscribe();
            }))
            .subscribe();
        } else {
          if (this.paymentAmount < this.freeShippingAmount) {
            this.toastyService.error(`${this.selectedMode.name} is not available for Order amount less than ${this.currency} ${this.freeShippingAmount}.`, "Order Amount");
          } else if (!this.isShippeble) {
            this.toastyService.error(`${this.selectedMode.name} is not available for pincode ${shipping_pincode}.`, "Pincode");
          }
        }
      })
  }

  makePaymentPayubiz() {
    this.checkoutService.makePayment(this.paymentAmount, this.address)
      .subscribe((response: any) => {
        response = response
        this.checkoutService.createNewPayment(this.selectedMode.id, this.paymentAmount).pipe(
          tap(() => {
            this.store.dispatch(this.checkoutActions.orderCompleteSuccess());
            this.checkoutService.createEmptyOrder()
              .subscribe();
          })
        )
          .subscribe((res) => {
            window.open(response.url, '_self');
          });
      })
  }

  makePaymentPayubiz() {
    const paymentModeId = this.selectedMode.id;
    const payUbizSalt = environment.config.payuBizSalt;
    const payUbizKey = environment.config.payuBizKey;
    const successUrl = `${environment.apiEndpoint}auth/handle_payment`;
    const failureUrl = `${environment.apiEndpoint}auth/canceled_payment`;

    const hashParams = {
      key: payUbizKey,
      txnid: `${this.orderNumber}`, //To be replace using random number
      amount: this.paymentAmount,
      productinfo: `${environment.appName}-Product`,
      firstname: this.address.firstname,
      email: JSON.parse(localStorage.getItem('user')).email,
    }

    // tslint:disable-next-line:max-line-length
    const paramsList = `${hashParams.key}|${hashParams.txnid}|${hashParams.amount}|${hashParams.productinfo}|${hashParams.firstname}|${hashParams.email}|||||||||||${payUbizSalt}`;
    const encryptedHash = CryptoJS.SHA512(paramsList);
    const hashString = CryptoJS.enc.Hex.stringify(encryptedHash)

    const paramsToPost = {
      key: hashParams.key,
      txnid: hashParams.txnid,
      amount: hashParams.amount,
      productinfo: hashParams.productinfo,
      firstname: hashParams.firstname,
      email: hashParams.email,
      phone: this.address.phone,
      surl: successUrl,
      furl: failureUrl,
      hash: hashString
    }

    this.checkoutService.makePayment(paramsToPost)
      .subscribe(response => {
        response = response
        this.checkoutService.createNewPayment(paymentModeId, this.paymentAmount).pipe(
          tap(() => {
            this.store.dispatch(this.checkoutActions.orderCompleteSuccess());
            this.checkoutService.createEmptyOrder()
              .subscribe();
          })
        )
          .subscribe(res => {
            window.open(response.url, '_self');
          });
      })
  }
  private redirectToNewPage() {
    if (this.isAuthenticated) {
      this.router.navigate(['checkout', 'order-success'],
        { queryParams: { orderReferance: this.orderNumber } });
    } else {
      this.router.navigate(['/']);
    }
  }
}

import { of, Subject } from 'rxjs';
import { Updatable } from '../src/updatable';

import { expect } from './support';

describe('The Updatable class', function() {
  it('mostly acts like a BehaviorSubject', function() {
    let fixture = new Updatable(() => of(42));
    expect(fixture.value).to.equal(42);

    let result = -1;
    fixture.subscribe(x => result = x);
    expect(result).to.equal(42);

    fixture = new Updatable(() => of(42));
    result = -1;
    fixture.subscribe(x => result = x);
    expect(result).to.equal(42);
  });

  it('blows up when we trash it', function() {
    let input = new Subject<number>();
    let fixture = new Updatable<number>(() => input);

    let error = null;
    // tslint:disable-next-line:no-empty
    fixture.subscribe(() => {}, (e) => error = e);
    expect(error).not.to.be.ok;

    input.error(new Error('Die'));
    expect(error).to.be.ok;

    error = null;
    // tslint:disable-next-line:no-empty
    fixture.subscribe(() => {}, (e) => error = e);
    expect(error).to.be.ok;

    input = new Subject();
    fixture = new Updatable(() => input);

    error = null;
    // tslint:disable-next-line:no-empty
    fixture.subscribe(() => {}, (e) => error = e);
    expect(error).not.to.be.ok;

    fixture.error(new Error('Die'));
    expect(error).to.be.ok;
  });

  it('calls the factory input but replays it', function() {
    const input = new Subject<number>();
    const fixture = new Updatable<number>(() => input);

    let value = -1;
    const sub = fixture.subscribe(x => value = x);

    expect(value).to.equal(-1);

    input.next(42);
    input.complete();
    sub.unsubscribe();
    expect(value).to.equal(42);

    value = -1;
    fixture.subscribe(x => value = x).unsubscribe();
    expect(value).to.equal(42);

    value = -1;
    fixture.subscribe(x => value = x);
    fixture.next(50);
    expect(value).to.equal(50);
  });

  it("doesn't reset once next is called", function() {
    const fixture = new Updatable<number>(() => of(-1));
    fixture.next(42);

    let latest = 0;
    fixture.subscribe(x => latest = x);
    expect(latest).to.equal(42);
  });

  it('shallow merges objects when used with the merge strategy', function() {
    const fixture = new Updatable<Object>(() => of({a: 1}), 'merge');
    expect(fixture.value).to.deep.equal({a: 1});

    fixture.next({b: 2});
    expect(fixture.value).to.deep.equal({a: 1, b: 2});

    fixture.next({a: 5});
    expect(fixture.value).to.deep.equal({a: 5, b: 2});
  });

  it('drops the current value on invalidate', function() {
    const fixture = new Updatable<Object>(() => of({a: 1}), 'merge');
    expect(fixture.value).to.deep.equal({a: 1});

    fixture.next({b: 2});
    expect(fixture.value).to.deep.equal({a: 1, b: 2});

    fixture.next({a: 5});
    expect(fixture.value).to.deep.equal({a: 5, b: 2});

    fixture.invalidate();
    expect(fixture.value).to.deep.equal({a: 1});
  });

  it('should execute onrelease handler', function() {
    let isReleased = false;
    const fixture = new Updatable<Object>(() => of({a: 1}), 'merge', () => isReleased = true);
    expect(isReleased).to.equal(false);

    const disp1 = fixture.subscribe();
    expect(isReleased).to.equal(false);
    const disp2 = fixture.subscribe();
    expect(isReleased).to.equal(false);

    disp2.unsubscribe();
    expect(isReleased).to.equal(false);
    disp1.unsubscribe();
    expect(isReleased).to.equal(true);
  });
});

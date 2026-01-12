import React from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

export type FilterType = 'Legacy' | 'Total';

export type Filter = {
    id: string;
    type: FilterType;
    stat: string;
    stars: number;
};

type FilterModalProps = {
    show: boolean;
    onHide: () => void;
    onAddFilter: (filter: Filter) => void;
    availableStats: string[];
    title: string;
    statLabel: string;
};

type FilterModalState = {
    type: FilterType;
    stat: string;
    stars: number;
};

export default class FilterModal extends React.Component<FilterModalProps, FilterModalState> {
    constructor(props: FilterModalProps) {
        super(props);
        this.state = {
            type: 'Total',
            stat: props.availableStats[0] || '',
            stars: 1,
        };
    }

    componentDidUpdate(prevProps: FilterModalProps) {
        // Update stat if availableStats changed and current stat is invalid
        if (prevProps.availableStats !== this.props.availableStats &&
            !this.props.availableStats.includes(this.state.stat)) {
            this.setState({ stat: this.props.availableStats[0] || '' });
        }
    }

    handleOk = () => {
        const filter: Filter = {
            id: `${Date.now()}-${Math.random()}`,
            type: this.state.type,
            stat: this.state.stat,
            stars: this.state.stars,
        };
        this.props.onAddFilter(filter);
        this.props.onHide();
        // Reset to defaults
        this.setState({
            type: 'Total',
            stat: this.props.availableStats[0] || '',
            stars: 1,
        });
    };

    render() {
        const maxStars = this.state.type === 'Legacy' ? 3 : 9;
        const currentStars = this.state.stars > maxStars ? maxStars : this.state.stars;

        return (
            <Modal show={this.props.show} onHide={this.props.onHide} contentClassName="bg-dark text-light">
                <Modal.Header closeButton className="bg-dark text-light border-secondary">
                    <Modal.Title>{this.props.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body className="bg-dark">
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Type</Form.Label>
                            <Form.Control
                                as="select"
                                value={this.state.type}
                                onChange={(e) => this.setState({ type: e.target.value as FilterType })}
                                className="bg-dark text-light"
                            >
                                <option value="Legacy">Legacy</option>
                                <option value="Total">Total</option>
                            </Form.Control>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>{this.props.statLabel}</Form.Label>
                            <Form.Control
                                as="select"
                                value={this.state.stat}
                                onChange={(e) => this.setState({ stat: e.target.value })}
                                className="bg-dark text-light"
                            >
                                {this.props.availableStats.map(stat => (
                                    <option key={stat} value={stat}>{stat}</option>
                                ))}
                            </Form.Control>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Stars</Form.Label>
                            <Form.Control
                                as="select"
                                value={currentStars}
                                onChange={(e) => this.setState({ stars: parseInt(e.target.value) })}
                                className="bg-dark text-light"
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                    <option
                                        key={num}
                                        value={num}
                                        disabled={num > maxStars}
                                    >
                                        {num}★
                                    </option>
                                ))}
                            </Form.Control>
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer className="bg-dark border-secondary">
                    <Button variant="secondary" onClick={this.props.onHide}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={this.handleOk}>
                        OK
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }
}
